import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { mailerService } from '../src/services/mailer.service.js';
import { agent, cookieFrom, loginUser, registerUser } from './helpers.js';

describe('auth', () => {
  it('registers, returns UserPublic and sets session cookies (AUTH-1)', async () => {
    const { res, agent: a } = await registerUser('alice@example.com');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      email: 'alice@example.com',
      name: 'Test User',
      role: 'user',
    });
    expect(res.body.data).not.toHaveProperty('passwordHash');
    expect(cookieFrom(res, 'access_token')).toBeDefined();
    expect(cookieFrom(res, 'refresh_token')).toBeDefined();

    const me = await a.get('/api/v1/users/me');
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('alice@example.com');
  });

  it('rejects duplicate email with 409 EMAIL_TAKEN (AUTH-1)', async () => {
    await registerUser('bob@example.com');
    const { res } = await registerUser('bob@example.com');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('trims and lowercases email on register', async () => {
    const { res } = await registerUser('  Carol@Example.COM ');
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('carol@example.com');
  });

  it('validates password rules (AUTH-1)', async () => {
    const a = agent();
    const noNumber = await a
      .post('/api/v1/auth/register')
      .send({ email: 'x@example.com', password: 'abcdefgh', name: 'X' });
    expect(noNumber.status).toBe(400);
    expect(noNumber.body.error.code).toBe('VALIDATION_ERROR');
    const short = await a.post('/api/v1/auth/register').send({ email: 'x@example.com', password: 'Ab1', name: 'X' });
    expect(short.status).toBe(400);
  });

  it('rejects extra fields on register (AUTH-10)', async () => {
    const a = agent();
    const res = await a.post('/api/v1/auth/register').send({
      email: 'd@example.com',
      password: 'Password123',
      name: 'D',
      role: 'admin',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in and returns 200 + cookies (AUTH-2)', async () => {
    await registerUser('eve@example.com');
    const { res } = await loginUser('eve@example.com');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(cookieFrom(res, 'access_token')).toBeDefined();
  });

  it('returns 401 AUTH_GENERIC for bad password and unknown email (AUTH-2)', async () => {
    await registerUser('frank@example.com');
    const bad = await loginUser('frank@example.com', 'WrongPass999');
    expect(bad.res.status).toBe(401);
    expect(bad.res.body.error.code).toBe('AUTH_GENERIC');
    const unknown = await loginUser('nobody@example.com');
    expect(unknown.res.status).toBe(401);
    expect(unknown.res.body.error.code).toBe('AUTH_GENERIC');
  });

  it('locks after 5 failed logins, still 401 AUTH_GENERIC (AUTH-11)', async () => {
    await registerUser('lock@example.com');
    for (let i = 0; i < 5; i++) {
      const res = await agent().post('/api/v1/auth/login').send({ email: 'lock@example.com', password: 'Wrong999' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_GENERIC');
    }
    const locked = await loginUser('lock@example.com');
    expect(locked.res.status).toBe(401);
    expect(locked.res.body.error.code).toBe('AUTH_GENERIC');
  });

  it('rejects inactive users with AUTH_GENERIC (AUTH-2)', async () => {
    const { res } = await registerUser('inactive@example.com');
    const id = res.body.data.id;
    const mongoose = await import('mongoose');
    await mongoose.connection.db!.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { isActive: false } },
    );
    const login = await loginUser('inactive@example.com');
    expect(login.res.status).toBe(401);
    expect(login.res.body.error.code).toBe('AUTH_GENERIC');
  });

  it('rotates refresh token; reuse of an old refresh revokes the family (AUTH-4/6)', async () => {
    const { res: registerRes, agent: a } = await registerUser('rotate@example.com');
    const oldRefresh = cookieFrom(registerRes, 'refresh_token');
    expect(oldRefresh).toBeDefined();

    const rotated = await a.post('/api/v1/auth/refresh');
    expect(rotated.status).toBe(200);
    expect(cookieFrom(rotated, 'refresh_token')).toBeDefined();

    // age the consumed session so reuse falls outside the 10s grace window
    const mongoose = await import('mongoose');
    await mongoose.connection.db!.collection('refreshsessions').updateMany(
      { usedAt: { $ne: null } },
      { $set: { usedAt: new Date(Date.now() - 20_000) } },
    );

    const reused = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldRefresh!);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('REFRESH_REUSE');

    // family revoked: a fresh refresh of the rotated cookie must also fail
    const familyReuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieFrom(rotated, 'refresh_token')!);
    expect(familyReuse.status).toBe(401);
  });

  it('logout clears cookies and revokes the family (AUTH-6)', async () => {
    const { agent: a } = await registerUser('logout@example.com');
    const refreshCookie = cookieFrom(await a.post('/api/v1/auth/refresh'), 'refresh_token')!;
    const out = await a.post('/api/v1/auth/logout');
    expect(out.status).toBe(204);
    const reused = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie);
    expect(reused.status).toBe(401);
  });

  it('logout with only an access cookie revokes the current session (AUTH-6)', async () => {
    const { res: regRes, agent: a } = await registerUser('logouttokenless@example.com');
    const accessCookie = cookieFrom(regRes, 'access_token')!;
    const refreshCookie = cookieFrom(regRes, 'refresh_token')!;
    // logout without the refresh cookie: the current session must be revoked
    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', accessCookie);
    expect(out.status).toBe(204);
    const reused = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie);
    expect(reused.status).toBe(401);
    void a;
  });

  it('expired lockout recovers: a later wrong password does not re-lock from a stale count (AUTH-11)', async () => {
    await registerUser('recover@example.com');
    for (let i = 0; i < 5; i++) {
      await agent().post('/api/v1/auth/login').send({ email: 'recover@example.com', password: 'Wrong999' });
    }
    const locked = await loginUser('recover@example.com');
    expect(locked.res.status).toBe(401);

    // age the lock and the failure window so both lapse
    const mongoose = await import('mongoose');
    await mongoose.connection.db!.collection('users').updateOne(
      { email: 'recover@example.com' },
      { $set: { lockedUntil: new Date(Date.now() - 60_000), failedLoginWindowStartAt: new Date(Date.now() - 60 * 60 * 1000) } },
    );

    // one more wrong password must start a fresh window, not re-lock
    const wrong = await agent().post('/api/v1/auth/login').send({ email: 'recover@example.com', password: 'Wrong999' });
    expect(wrong.status).toBe(401);

    // correct password now succeeds
    const ok = await loginUser('recover@example.com');
    expect(ok.res.status).toBe(200);
  });

  it('logout-all revokes every family (AUTH-6)', async () => {
    const { agent: a } = await registerUser('all@example.com');
    const c1 = cookieFrom(await a.post('/api/v1/auth/refresh'), 'refresh_token')!;
    const c2 = cookieFrom(await a.post('/api/v1/auth/refresh'), 'refresh_token')!;
    const out = await a.post('/api/v1/auth/logout-all');
    expect(out.status).toBe(204);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', c1)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', c2)).status).toBe(401);
  });

  it('forgot-password always returns 200; reset works once and token is single-use (AUTH-7)', async () => {
    const { agent: a } = await registerUser('reset@example.com');

    let capturedToken = '';
    const spy = vi
      .spyOn(mailerService, 'sendPasswordReset')
      .mockImplementation(async (_email: string, token: string) => {
        capturedToken = token;
      });

    const forgot = await a.post('/api/v1/auth/forgot-password').send({ email: 'reset@example.com' });
    expect(forgot.status).toBe(200);
    expect(forgot.body.data).toEqual({ ok: true });
    expect(capturedToken.length).toBeGreaterThan(0);
    spy.mockRestore();

    const unknown = await agent().post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(unknown.status).toBe(200);

    const reset = await agent()
      .post('/api/v1/auth/reset-password')
      .send({ token: capturedToken, password: 'NewPassword456' });
    expect(reset.status).toBe(200);
    expect(reset.body.data.email).toBe('reset@example.com');

    const again = await agent()
      .post('/api/v1/auth/reset-password')
      .send({ token: capturedToken, password: 'Another789' });
    expect(again.status).toBe(400);

    const oldLogin = await loginUser('reset@example.com', 'Password123');
    expect(oldLogin.res.status).toBe(401);
  });
});