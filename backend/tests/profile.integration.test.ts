import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { cookieFrom, registerUser } from './helpers.js';

describe('profile', () => {
  it('returns the current user (PROFILE-1)', async () => {
    const { agent: a } = await registerUser('me@example.com');
    const res = await a.get('/api/v1/users/me');
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('me@example.com');
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('updates the name (PROFILE-2)', async () => {
    const { agent: a } = await registerUser('name@example.com');
    const res = await a.patch('/api/v1/users/me').send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
    const me = await a.get('/api/v1/users/me');
    expect(me.body.data.name).toBe('New Name');
  });

  it('rejects other fields on profile update', async () => {
    const { agent: a } = await registerUser('strict@example.com');
    const res = await a.patch('/api/v1/users/me').send({ email: 'hacked@example.com' });
    expect(res.status).toBe(400);
  });

  it('rejects wrong current password with 401 AUTH_GENERIC (PROFILE-3)', async () => {
    const { agent: a } = await registerUser('pw@example.com');
    const res = await a.post('/api/v1/users/me/password').send({
      currentPassword: 'WrongPass999',
      newPassword: 'FreshPass456',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_GENERIC');
  });

  it('changes the password, rotates the session and revokes other sessions (PROFILE-3)', async () => {
    const { agent: a } = await registerUser('changepw@example.com');
    const oldRefresh = cookieFrom(await a.post('/api/v1/auth/refresh'), 'refresh_token')!;

    const res = await a.post('/api/v1/users/me/password').send({
      currentPassword: 'Password123',
      newPassword: 'FreshPass456',
    });
    expect(res.status).toBe(200);
    expect(cookieFrom(res, 'refresh_token')).toBeDefined();

    // old refresh session is now revoked
    const reused = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldRefresh);
    expect(reused.status).toBe(401);

    // old password no longer works
    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email: 'changepw@example.com', password: 'Password123' });
    expect(oldLogin.status).toBe(401);
  });
});