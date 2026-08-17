import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { User } from '../models/user.js';
import { Driver } from '../models/driver.js';
import { Vehicle } from '../models/vehicle.js';
import { Notification } from '../models/notification.js';
import { AuditLog } from '../models/audit-log.js';

describe('resource management invariants', () => {
  const app = createApp();
  let admin;
  let token;

  beforeEach(async () => {
    admin = await User.create({ name: 'Admin', email: 'admin@example.com', role: 'admin', passwordHash: await User.hashPassword('Password1') });
    const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'Password1' });
    token = login.body.data.accessToken;
  });

  it('prevents an admin from changing their own role', async () => {
    const response = await request(app).patch(`/api/v1/users/${admin._id}`).set('Authorization', `Bearer ${token}`).send({ role: 'customer' }).expect(409);
    expect(response.body.error.code).toBe('SELF_ROLE_CHANGE');
    expect((await User.findById(admin._id)).role).toBe('admin');
  });

  it('allows an admin to create another admin account', async () => {
    const response = await request(app).post('/api/v1/users').set('Authorization', `Bearer ${token}`).send({
      name: 'New Admin', email: 'new-admin@example.com', password: 'Password1', role: 'admin'
    }).expect(201);
    expect(response.body.data.user.role).toBe('admin');
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(await User.findOne({ email: 'new-admin@example.com' })).toBeTruthy();
  });

  it('requires customers to create their own account through sign up', async () => {
    await request(app).post('/api/v1/users').set('Authorization', `Bearer ${token}`).send({
      name: 'Customer', email: 'admin-created-customer@example.com', password: 'Password1', role: 'customer'
    }).expect(422);
    expect(await User.findOne({ email: 'admin-created-customer@example.com' })).toBeNull();
  });

  it('creates a driver account and driver profile together', async () => {
    const response = await request(app).post('/api/v1/users').set('Authorization', `Bearer ${token}`).send({
      name: 'New Driver', email: 'new-driver@example.com', password: 'Password1', role: 'driver',
      licenseNumber: 'DL-NEW-100', licenseExpiresAt: new Date(Date.now() + 86400000).toISOString(), driverStatus: 'available'
    }).expect(201);
    expect(response.body.data.user.role).toBe('driver');
    const profile = await Driver.findOne({ user: response.body.data.user._id });
    expect(profile.licenseNumber).toBe('DL-NEW-100');
    expect(profile.status).toBe('available');
  });

  it('does not allow a driver to create staff accounts', async () => {
    const driver = await User.create({ name: 'Driver', email: 'staff-driver@example.com', role: 'driver', passwordHash: await User.hashPassword('Password1') });
    const login = await request(app).post('/api/v1/auth/login').send({ email: driver.email, password: 'Password1' });
    await request(app).post('/api/v1/users').set('Authorization', `Bearer ${login.body.data.accessToken}`).send({
      name: 'Blocked Admin', email: 'blocked@example.com', password: 'Password1', role: 'admin'
    }).expect(403);
  });

  it('keeps assigned drivers and vehicles reserved', async () => {
    const driverUser = await User.create({ name: 'Driver', email: 'driver@example.com', role: 'driver', passwordHash: 'unused' });
    const deliveryId = admin._id;
    const driver = await Driver.create({ user: driverUser._id, licenseNumber: 'LOCKED-DRIVER', licenseExpiresAt: new Date(Date.now() + 86400000), status: 'busy', currentDelivery: deliveryId });
    const vehicle = await Vehicle.create({ registrationNumber: 'LOCKED-VEHICLE', type: 'van', capacityKg: 100, status: 'in_use', currentDelivery: deliveryId });

    const driverResponse = await request(app).patch(`/api/v1/drivers/${driver._id}`).set('Authorization', `Bearer ${token}`).send({ status: 'available' }).expect(409);
    const vehicleResponse = await request(app).patch(`/api/v1/vehicles/${vehicle._id}`).set('Authorization', `Bearer ${token}`).send({ isActive: false }).expect(409);

    expect(driverResponse.body.error.code).toBe('DRIVER_ASSIGNED');
    expect(vehicleResponse.body.error.code).toBe('VEHICLE_ASSIGNED');
    expect((await Driver.findById(driver._id)).status).toBe('busy');
    expect((await Vehicle.findById(vehicle._id)).isActive).toBe(true);
  });

  it('returns only notifications that belong to the signed-in user', async () => {
    const driver = await User.create({ name: 'Driver', email: 'notice-driver@example.com', role: 'driver', passwordHash: await User.hashPassword('Password1') });
    const login = await request(app).post('/api/v1/auth/login').send({ email: driver.email, password: 'Password1' });
    await Notification.create([
      { key: 'admin-alert', audienceRole: 'admin', type: 'delivery_delayed', delivery: admin._id, message: 'Admin only' },
      { key: 'driver-alert', recipient: driver._id, type: 'delivery_reassigned', delivery: admin._id, message: 'Driver only' },
      { key: 'admin-personal', recipient: admin._id, type: 'delivery_reassigned', delivery: admin._id, message: 'Admin personal' }
    ]);

    const driverResponse = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(200);
    expect(driverResponse.body.data.items.map((item) => item.message)).toEqual(['Driver only']);
    expect(driverResponse.body.data.unreadCount).toBe(1);

    const adminResponse = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${token}`).expect(200);
    expect(new Set(adminResponse.body.data.items.map((item) => item.message))).toEqual(new Set(['Admin only', 'Admin personal']));
    expect(adminResponse.body.data.unreadCount).toBe(2);
  });

  it('marks one or all owned notifications as read without changing another user notification', async () => {
    const other = await User.create({ name: 'Other Driver', email: 'other-notice@example.com', role: 'driver', passwordHash: 'unused' });
    const [first, second, inaccessible] = await Notification.create([
      { key: 'read-one', audienceRole: 'admin', type: 'delivery_delayed', delivery: admin._id, message: 'First' },
      { key: 'read-all', recipient: admin._id, type: 'delivery_reassigned', delivery: admin._id, message: 'Second' },
      { key: 'do-not-read', recipient: other._id, type: 'delivery_reassigned', delivery: admin._id, message: 'Other' }
    ]);

    const readOne = await request(app).patch(`/api/v1/notifications/${first._id}/read`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(readOne.body.data.readAt).toBeTruthy();
    await request(app).patch(`/api/v1/notifications/${inaccessible._id}/read`).set('Authorization', `Bearer ${token}`).expect(404);
    const readAll = await request(app).patch('/api/v1/notifications/read-all').set('Authorization', `Bearer ${token}`).expect(200);
    expect(readAll.body.data.updatedCount).toBe(1);

    expect((await Notification.findById(second._id)).readAt).toBeTruthy();
    expect((await Notification.findById(inaccessible._id)).readAt).toBeFalsy();
  });

  it('filters audit history by actor and action and keeps it admin-only', async () => {
    const driver = await User.create({ name: 'Audit Driver', email: 'audit-driver@example.com', role: 'driver', passwordHash: await User.hashPassword('Password1') });
    const driverLogin = await request(app).post('/api/v1/auth/login').send({ email: driver.email, password: 'Password1' });
    await AuditLog.create([
      { actor: admin._id, action: 'delivery.reassigned', entityType: 'Delivery', entityId: admin._id, metadata: { oldValues: { status: 'accepted' }, newValues: { status: 'assigned' } }, requestId: 'request-1' },
      { actor: driver._id, action: 'delivery.assignment_rejected', entityType: 'Delivery', entityId: driver._id, requestId: 'request-2' }
    ]);

    const response = await request(app).get(`/api/v1/audit-logs?actor=${admin._id}&action=delivery.reassigned`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].actor.name).toBe('Admin');
    expect(response.body.data.items[0].requestId).toBe('request-1');
    expect(response.body.data.actions).toEqual(['delivery.assignment_rejected', 'delivery.reassigned']);

    await request(app).get('/api/v1/audit-logs').set('Authorization', `Bearer ${driverLogin.body.data.accessToken}`).expect(403);
  });
});
