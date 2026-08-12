import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { User } from '../models/user.js';
import { Driver } from '../models/driver.js';
import { Vehicle } from '../models/vehicle.js';

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
    const response = await request(app).patch(`/api/v1/users/${admin._id}`).set('Authorization', `Bearer ${token}`).send({ role: 'manager' }).expect(409);
    expect(response.body.error.code).toBe('SELF_ROLE_CHANGE');
    expect((await User.findById(admin._id)).role).toBe('admin');
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
});
