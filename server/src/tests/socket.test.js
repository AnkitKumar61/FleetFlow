import { createServer } from 'node:http';
import { io as createClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { attachSocketServer } from '../socket.js';
import { User } from '../models/user.js';
import { Delivery } from '../models/delivery.js';
import { Driver } from '../models/driver.js';

const app = createApp();
const httpServer = createServer(app);
const io = attachSocketServer(httpServer);
let origin;
const users = {};
const tokens = {};
const address = { line1: '1 Socket Street', city: 'Pune', state: 'Maharashtra', postalCode: '411001' };

beforeAll(async () => {
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${httpServer.address().port}`;
});
beforeEach(async () => {
  for (const [key, role] of [['customer', 'customer'], ['other', 'customer'], ['driver', 'driver'], ['admin', 'admin']]) {
    const email = `${key}@socket.test`;
    users[key] = await User.create({ name: key, email, role, passwordHash: await User.hashPassword('Password1') });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password1' });
    tokens[key] = login.body.data.accessToken;
  }
});
afterAll(async () => {
  await io.close();
  if (httpServer.listening) await new Promise((resolve) => httpServer.close(resolve));
});

const connect = (token) => new Promise((resolve, reject) => {
  const socket = createClient(origin, { auth: { token }, transports: ['websocket'], forceNew: true });
  socket.once('connect', () => resolve(socket));
  socket.once('connect_error', reject);
});
const nextUpdate = (socket) => new Promise((resolve) => socket.once('delivery:updated', resolve));

describe('Socket.IO delivery authorization', () => {
  it('keeps the availability selected by a driver when their socket connects or disconnects', async () => {
    const profile = await Driver.create({ user: users.driver._id, licenseNumber: 'SOCKET-AVAILABILITY', licenseExpiresAt: new Date(Date.now() + 86400000), status: 'offline' });
    const driver = await connect(tokens.driver);
    expect((await Driver.findById(profile._id)).status).toBe('offline');
    driver.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await Driver.findById(profile._id)).status).toBe('offline');
  });

  it('targets appropriate roles and rejects unauthorized room watches', async () => {
    const delivery = await Delivery.create({ trackingNumber: 'FF-SOCKET', customer: users.customer._id, pickupAddress: address, deliveryAddress: address, packageDescription: 'Socket package', packageWeightKg: 2, expectedDeliveryAt: new Date(Date.now() + 86400000), history: [{ status: 'pending', actor: users.customer._id }] });
    const [customer, other, driver, admin] = await Promise.all(Object.values(tokens).map(connect));
    try {
      const watch = await other.timeout(2000).emitWithAck('delivery:watch', delivery._id.toString());
      expect(watch).toEqual({ ok: false, error: 'FORBIDDEN' });
      const customerEvent = nextUpdate(customer);
      const adminEvent = nextUpdate(admin);
      let unrelatedReceived = false;
      let driverReceived = false;
      other.once('delivery:updated', () => { unrelatedReceived = true; });
      driver.once('delivery:updated', () => { driverReceived = true; });
      await request(app).patch(`/api/v1/deliveries/${delivery._id}/status`).set('Authorization', `Bearer ${tokens.admin}`).send({ status: 'cancelled' }).expect(200);
      expect((await customerEvent).status).toBe('cancelled');
      expect((await adminEvent).status).toBe('cancelled');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unrelatedReceived).toBe(false);
      expect(driverReceived).toBe(false);
    } finally { customer.close(); other.close(); driver.close(); admin.close(); }
  });
  it('delivers updates directly to the assigned driver', async () => {
    const profile = await Driver.create({ user: users.driver._id, licenseNumber: 'SOCKET-LICENSE', licenseExpiresAt: new Date(Date.now() + 86400000), status: 'busy' });
    const delivery = await Delivery.create({ trackingNumber: 'FF-SOCKET-DRIVER', customer: users.customer._id, assignedDriver: profile._id, status: 'assigned', pickupAddress: address, deliveryAddress: address, packageDescription: 'Assigned socket package', packageWeightKg: 2, expectedDeliveryAt: new Date(Date.now() + 86400000), history: [{ status: 'assigned', actor: users.admin._id }] });
    profile.currentDelivery = delivery._id;
    await profile.save();
    const driver = await connect(tokens.driver);
    try {
      const update = nextUpdate(driver);
      await request(app).patch(`/api/v1/deliveries/${delivery._id}/status`).set('Authorization', `Bearer ${tokens.admin}`).send({ status: 'rescheduled' }).expect(200);
      expect((await update).status).toBe('rescheduled');
    } finally { driver.close(); }
  });
});
