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

  async function verifyStaffPhone(phone) {
    const started = await request(app).post('/api/v1/phone-verifications').set('Authorization', `Bearer ${token}`).send({ phone }).expect(201);
    const verified = await request(app).post('/api/v1/phone-verifications/verify').set('Authorization', `Bearer ${token}`).send({
      phone,
      verificationId: started.body.data.verificationId,
      code: started.body.data.testCode
    }).expect(200);
    return verified.body.data.verificationToken;
  }

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

  it('searches, filters, and paginates the account directory', async () => {
    await User.create(Array.from({ length: 12 }, (_, index) => ({
      name: `Directory Member ${index + 1}`,
      email: `directory-${index + 1}@example.com`,
      role: index < 9 ? 'driver' : 'customer',
      isActive: index !== 4,
      passwordHash: 'unused'
    })));

    const response = await request(app)
      .get('/api/v1/users?search=Directory&role=driver&status=active&page=2&limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.items).toHaveLength(3);
    expect(response.body.data.items.every((item) => item.role === 'driver' && item.isActive)).toBe(true);
    expect(response.body.data.pagination).toEqual({ page: 2, limit: 5, total: 8, totalPages: 2 });
  });

  it('requires customers to create their own account through sign up', async () => {
    await request(app).post('/api/v1/users').set('Authorization', `Bearer ${token}`).send({
      name: 'Customer', email: 'admin-created-customer@example.com', password: 'Password1', role: 'customer'
    }).expect(422);
    expect(await User.findOne({ email: 'admin-created-customer@example.com' })).toBeNull();
  });

  it('creates a driver account and driver profile together', async () => {
    const phone = '+919876543220';
    const response = await request(app).post('/api/v1/users').set('Authorization', `Bearer ${token}`).send({
      name: 'New Driver', email: 'new-driver@example.com', password: 'Password1', role: 'driver',
      phone, phoneVerificationToken: await verifyStaffPhone(phone),
      licenseNumber: 'DL-NEW-100', licenseExpiresAt: new Date(Date.now() + 86400000).toISOString(), driverStatus: 'available'
    }).expect(201);
    expect(response.body.data.user.role).toBe('driver');
    const profile = await Driver.findOne({ user: response.body.data.user._id });
    expect(profile.licenseNumber).toBe('DL-NEW-100');
    expect(profile.status).toBe('available');
    expect(response.body.data.user.phone).toBe(phone);
    expect(response.body.data.user.phoneVerifiedAt).toBeTruthy();
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

  it('blocks a Driver to Customer role change while a delivery is active', async () => {
    const driverUser = await User.create({ name: 'Busy Driver', email: 'busy-role@example.com', role: 'driver', passwordHash: 'unused' });
    const profile = await Driver.create({ user: driverUser._id, licenseNumber: 'BUSY-ROLE', licenseExpiresAt: new Date(Date.now() + 86400000), status: 'busy', currentDelivery: admin._id });

    const response = await request(app).patch(`/api/v1/users/${driverUser._id}`).set('Authorization', `Bearer ${token}`).send({ role: 'customer' }).expect(409);

    expect(response.body.error.code).toBe('DRIVER_ACTIVE_DELIVERY');
    expect((await User.findById(driverUser._id)).role).toBe('driver');
    expect((await Driver.findById(profile._id)).isActive).toBe(true);
    expect(await AuditLog.findOne({ entityId: driverUser._id, action: 'user.role_changed' })).toBeNull();
  });

  it('deactivates a former driver atomically and safely reactivates a valid profile', async () => {
    const driverUser = await User.create({
      name: 'Role Driver', email: 'role-driver@example.com', phone: '+919876543230', phoneVerifiedAt: new Date(), role: 'driver', passwordHash: 'unused'
    });
    const profile = await Driver.create({ user: driverUser._id, licenseNumber: 'ROLE-CHANGE', licenseExpiresAt: new Date(Date.now() + 86400000), status: 'available' });

    await request(app).patch(`/api/v1/users/${driverUser._id}`).set('Authorization', `Bearer ${token}`).send({ role: 'customer' }).expect(200);
    const [customer, inactiveProfile, firstAudit] = await Promise.all([
      User.findById(driverUser._id), Driver.findById(profile._id), AuditLog.findOne({ entityId: driverUser._id, action: 'user.role_changed' }).sort({ createdAt: -1 })
    ]);
    expect(customer.role).toBe('customer');
    expect(inactiveProfile.status).toBe('offline');
    expect(inactiveProfile.isActive).toBe(false);
    expect(firstAudit.metadata.oldValues).toMatchObject({ role: 'driver', driverStatus: 'available', driverIsActive: true });
    expect(firstAudit.metadata.newValues).toMatchObject({ role: 'customer', driverStatus: 'offline', driverIsActive: false });

    await request(app).patch(`/api/v1/users/${driverUser._id}`).set('Authorization', `Bearer ${token}`).send({ role: 'driver' }).expect(200);
    const [restoredUser, restoredProfile] = await Promise.all([User.findById(driverUser._id), Driver.findById(profile._id)]);
    expect(restoredUser.role).toBe('driver');
    expect(restoredProfile.status).toBe('offline');
    expect(restoredProfile.isActive).toBe(true);
    expect(await AuditLog.countDocuments({ entityId: driverUser._id, action: 'user.role_changed' })).toBe(2);
  });

  it('requires a verified phone and valid licence before restoring the Driver role', async () => {
    const formerDriver = await User.create({ name: 'Former Driver', email: 'former@example.com', role: 'customer', passwordHash: 'unused' });
    const profile = await Driver.create({ user: formerDriver._id, licenseNumber: 'FORMER-DRIVER', licenseExpiresAt: new Date(Date.now() - 86400000), status: 'offline', isActive: false });

    const noPhone = await request(app).patch(`/api/v1/users/${formerDriver._id}`).set('Authorization', `Bearer ${token}`).send({ role: 'driver' }).expect(409);
    expect(noPhone.body.error.code).toBe('VERIFIED_PHONE_REQUIRED');
    formerDriver.phone = '+919876543231';
    formerDriver.phoneVerifiedAt = new Date();
    await formerDriver.save();
    const expired = await request(app).patch(`/api/v1/users/${formerDriver._id}`).set('Authorization', `Bearer ${token}`).send({ role: 'driver' }).expect(409);
    expect(expired.body.error.code).toBe('DRIVER_LICENCE_EXPIRED');
    expect((await User.findById(formerDriver._id)).role).toBe('customer');
    expect((await Driver.findById(profile._id)).isActive).toBe(false);
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
    expect(response.body.data.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });

    await request(app).get('/api/v1/audit-logs').set('Authorization', `Bearer ${driverLogin.body.data.accessToken}`).expect(403);
  });

  it('paginates audit history and filters an inclusive date range', async () => {
    const insideRange = Array.from({ length: 25 }, (_, index) => ({
      actor: admin._id,
      action: 'delivery.status_changed',
      entityType: 'Delivery',
      entityId: admin._id,
      requestId: `dated-request-${index + 1}`,
      createdAt: new Date(`2026-08-10T10:${String(index).padStart(2, '0')}:00.000Z`)
    }));
    await AuditLog.create([
      ...insideRange,
      { actor: admin._id, action: 'delivery.created', entityType: 'Delivery', entityId: admin._id, requestId: 'outside-range', createdAt: new Date('2026-07-31T23:59:59.999Z') }
    ]);

    const response = await request(app)
      .get('/api/v1/audit-logs?page=2&limit=10&from=2026-08-10T00%3A00%3A00.000Z&to=2026-08-10T23%3A59%3A59.999Z')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.items).toHaveLength(10);
    expect(response.body.data.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(response.body.data.items.every((item) => item.requestId.startsWith('dated-request-'))).toBe(true);

    await request(app).get('/api/v1/audit-logs?limit=15').set('Authorization', `Bearer ${token}`).expect(422);
    await request(app).get('/api/v1/audit-logs?from=2026-08-12T00%3A00%3A00.000Z&to=2026-08-11T23%3A59%3A59.999Z').set('Authorization', `Bearer ${token}`).expect(422);
  });
});
