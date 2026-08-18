import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { PhoneVerification } from '../models/phone-verification.js';
import { User } from '../models/user.js';

const app = createApp();

async function verifyCustomerPhone(phone) {
  const started = await request(app).post('/api/v1/auth/phone-verifications').send({ phone }).expect(201);
  expect(started.body.data.mode).toBe('test');
  expect(started.body.data.testCode).toMatch(/^\d{6}$/);
  const verified = await request(app).post('/api/v1/auth/phone-verifications/verify').send({
    phone,
    verificationId: started.body.data.verificationId,
    code: started.body.data.testCode
  }).expect(200);
  return verified.body.data.verificationToken;
}

describe('authentication', () => {
  it('verifies a phone, registers a customer, and logs in with a short-lived access token', async () => {
    const phone = '+919876543210';
    const payload = {
      name: 'Test Customer',
      email: 'customer@example.com',
      phone,
      phoneVerificationToken: await verifyCustomerPhone(phone),
      password: 'Password1'
    };
    const registered = await request(app).post('/api/v1/auth/register').send(payload).expect(201);
    expect(registered.body.data.user.role).toBe('customer');
    expect(registered.body.data.user.phone).toBe(phone);
    expect(registered.body.data.user.phoneVerifiedAt).toBeTruthy();
    expect(registered.body.data.accessToken).toBeTruthy();
    expect(registered.headers['set-cookie'][0]).toContain('HttpOnly');
    const capabilities = await request(app).get('/api/v1/system/capabilities').set('Authorization', `Bearer ${registered.body.data.accessToken}`).expect(200);
    expect(capabilities.body.data).toEqual({ proofImageStorage: false });
    const login = await request(app).post('/api/v1/auth/login').send({ email: payload.email, password: payload.password }).expect(200);
    expect(login.body.data.accessToken).toBeTruthy();
  });

  it('rejects an incorrect code and does not allow a verification token to be reused', async () => {
    const phone = '+919876543211';
    const started = await request(app).post('/api/v1/auth/phone-verifications').send({ phone }).expect(201);
    await request(app).post('/api/v1/auth/phone-verifications/verify').send({ phone, verificationId: started.body.data.verificationId, code: '000000' }).expect(422);
    const verified = await request(app).post('/api/v1/auth/phone-verifications/verify').send({ phone, verificationId: started.body.data.verificationId, code: started.body.data.testCode }).expect(200);
    const payload = { name: 'Single Use', email: 'single@example.com', phone, phoneVerificationToken: verified.body.data.verificationToken, password: 'Password1' };
    await request(app).post('/api/v1/auth/register').send(payload).expect(201);
    await request(app).post('/api/v1/auth/register').send({ ...payload, email: 'reuse@example.com' }).expect(422);
  });

  it('requires phone verification before customer registration', async () => {
    await request(app).post('/api/v1/auth/register').send({
      name: 'No Verification', email: 'unverified@example.com', phone: '+919876543212', password: 'Password1'
    }).expect(422);
    expect(await User.findOne({ email: 'unverified@example.com' })).toBeNull();
  });

  it('stores only a protected code, enforces resend waiting, expiry, and attempt limits', async () => {
    const expiringPhone = '+919876543214';
    const started = await request(app).post('/api/v1/auth/phone-verifications').send({ phone: expiringPhone }).expect(201);
    const stored = await PhoneVerification.findById(started.body.data.verificationId);
    expect(stored.codeHash).not.toContain(started.body.data.testCode);
    await request(app).post('/api/v1/auth/phone-verifications').send({ phone: expiringPhone }).expect(429);
    stored.expiresAt = new Date(Date.now() - 1000);
    await stored.save();
    await request(app).post('/api/v1/auth/phone-verifications/verify').send({ phone: expiringPhone, verificationId: stored._id, code: started.body.data.testCode }).expect(410);

    const lockedPhone = '+919876543215';
    const locked = await request(app).post('/api/v1/auth/phone-verifications').send({ phone: lockedPhone }).expect(201);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/v1/auth/phone-verifications/verify').send({ phone: lockedPhone, verificationId: locked.body.data.verificationId, code: '000000' }).expect(422);
    }
    await request(app).post('/api/v1/auth/phone-verifications/verify').send({ phone: lockedPhone, verificationId: locked.body.data.verificationId, code: locked.body.data.testCode }).expect(429);
  });

  it('rotates refresh tokens and rejects reuse', async () => {
    const phone = '+919876543213';
    const registered = await request(app).post('/api/v1/auth/register').send({
      name: 'Refresh User', email: 'refresh@example.com', phone, phoneVerificationToken: await verifyCustomerPhone(phone), password: 'Password1'
    });
    const cookie = registered.headers['set-cookie'][0].split(';')[0];
    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);
    expect(refreshed.body.data.accessToken).toBeTruthy();
    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('blocks customers from admin endpoints', async () => {
    await User.create({ name: 'No Access', email: 'no@example.com', role: 'customer', passwordHash: await User.hashPassword('Password1') });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'no@example.com', password: 'Password1' });
    await request(app).get('/api/v1/users').set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(403);
  });
});
