import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { User } from '../models/user.js';

const app=createApp();
describe('authentication',()=>{
  it('registers a customer and logs in with a short-lived access token',async()=>{const payload={name:'Test Customer',email:'customer@example.com',password:'Password1'};const registered=await request(app).post('/api/v1/auth/register').send(payload).expect(201);expect(registered.body.data.user.role).toBe('customer');expect(registered.body.data.accessToken).toBeTruthy();expect(registered.headers['set-cookie'][0]).toContain('HttpOnly');const login=await request(app).post('/api/v1/auth/login').send({email:payload.email,password:payload.password}).expect(200);expect(login.body.data.accessToken).toBeTruthy();});
  it('rotates refresh tokens and rejects reuse',async()=>{const registered=await request(app).post('/api/v1/auth/register').send({name:'Refresh User',email:'refresh@example.com',password:'Password1'});const cookie=registered.headers['set-cookie'][0].split(';')[0];const refreshed=await request(app).post('/api/v1/auth/refresh').set('Cookie',cookie).expect(200);expect(refreshed.body.data.accessToken).toBeTruthy();await request(app).post('/api/v1/auth/refresh').set('Cookie',cookie).expect(401);});
  it('blocks customers from admin endpoints',async()=>{await User.create({name:'No Access',email:'no@example.com',role:'customer',passwordHash:await User.hashPassword('Password1')});const login=await request(app).post('/api/v1/auth/login').send({email:'no@example.com',password:'Password1'});await request(app).get('/api/v1/users').set('Authorization',`Bearer ${login.body.data.accessToken}`).expect(403);});
});

