import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createAdmin, createWorkOrder, registerUser } from './helpers.js';

describe('admin', () => {
  it('rejects non-admins with 403 FORBIDDEN', async () => {
    const { agent: user } = await registerUser('plain@example.com');
    const res = await user.get('/api/v1/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('lists users with offset pagination, search and role filter (ADM-1)', async () => {
    const { agent: admin } = await createAdmin();
    await registerUser('zack@example.com');
    await registerUser('amy@example.com');

    const all = await admin.get('/api/v1/admin/users?limit=10');
    expect(all.status).toBe(200);
    expect(all.body.data.items.length).toBe(3);
    expect(all.body.data.total).toBe(3);

    const searched = await admin.get('/api/v1/admin/users?search=amy');
    expect(searched.body.data.items.map((u: { email: string }) => u.email)).toEqual(['amy@example.com']);

    const roleFilter = await admin.get('/api/v1/admin/users?role=user');
    expect(roleFilter.body.data.items.every((u: { role: string }) => u.role === 'user')).toBe(true);
  });

  it('rejects changing your own role (ADM-2)', async () => {
    const { agent: admin } = await createAdmin();
    const me = await admin.get('/api/v1/users/me');
    const res = await admin.patch(`/api/v1/admin/users/${me.body.data.id}/role`).send({ role: 'user' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects demoting the last admin (ADM-2 / AUTH-9)', async () => {
    const { agent: admin } = await createAdmin();
    const me = await admin.get('/api/v1/users/me');
    // remove the other (seed) admin if any — only one admin exists here
    const admins = await admin.get('/api/v1/admin/users?role=admin');
    expect(admins.body.data.items.length).toBe(1);

    const promoted = await admin.patch(`/api/v1/admin/users/${me.body.data.id}/role`).send({ role: 'user' });
    expect(promoted.status).toBe(403);
    expect(promoted.body.error.code).toBe('FORBIDDEN');

    // demoting the last admin to viewer is also rejected
    const toViewer = await admin.patch(`/api/v1/admin/users/${me.body.data.id}/role`).send({ role: 'viewer' });
    expect(toViewer.status).toBe(403);
    expect(toViewer.body.error.code).toBe('FORBIDDEN');
  });

  it('promotes and demotes another user; demotion revokes sessions (ADM-2)', async () => {
    const { agent: admin } = await createAdmin();
    const { agent: victim } = await registerUser('victim@example.com');

    const user = await admin.get('/api/v1/admin/users?search=victim');
    const victimId = user.body.data.items[0].id;

    const promoted = await admin.patch(`/api/v1/admin/users/${victimId}/role`).send({ role: 'admin' });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.role).toBe('admin');

    const demoted = await admin.patch(`/api/v1/admin/users/${victimId}/role`).send({ role: 'user' });
    expect(demoted.status).toBe(200);
    expect(demoted.body.data.role).toBe('user');

    // victim's sessions were revoked on demotion → refresh fails
    const refreshRes = await victim.post('/api/v1/auth/refresh');
    expect(refreshRes.status).toBe(401);
  });

  it('deactivates a user and revokes their sessions (ADM-5)', async () => {
    const { agent: admin } = await createAdmin();
    const { agent: victim } = await registerUser('deactivate@example.com');
    const user = await admin.get('/api/v1/admin/users?search=deactivate');
    const victimId = user.body.data.items[0].id;

    const deactivate = await admin.patch(`/api/v1/admin/users/${victimId}/status`).send({ isActive: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.data.isActive).toBe(false);

    const victimMe = await victim.get('/api/v1/users/me');
    expect(victimMe.status).toBe(401);

    const refreshRes = await victim.post('/api/v1/auth/refresh');
    expect(refreshRes.status).toBe(401);
  });

  it('rejects deactivating yourself (ADM-5)', async () => {
    const { agent: admin } = await createAdmin();
    const me = await admin.get('/api/v1/users/me');
    const res = await admin.patch(`/api/v1/admin/users/${me.body.data.id}/status`).send({ isActive: false });
    expect(res.status).toBe(403);
  });

  it('lists all work orders regardless of owner (ADM-3)', async () => {
    const { agent: admin } = await createAdmin();
    const { agent: u1 } = await registerUser('a1@example.com');
    const { agent: u2 } = await registerUser('a2@example.com');
    await createWorkOrder(u1, { title: 'From A1' });
    await createWorkOrder(u2, { title: 'From A2' });

    const all = await admin.get('/api/v1/admin/work-orders');
    expect(all.status).toBe(200);
    expect(all.body.data.items.map((w: { title: string }) => w.title).sort()).toEqual(['From A1', 'From A2']);
  });

  it('returns admin metrics (ADM-4)', async () => {
    const { agent: admin } = await createAdmin();
    const { agent: u } = await registerUser('metrics@example.com');
    await createWorkOrder(u, { title: 'Metrics job' });
    const res = await admin.get('/api/v1/admin/metrics');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ users: 2, workOrders: 1 });
    expect(res.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});