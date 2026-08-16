import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createWorkOrder, registerUser } from './helpers.js';

describe('work orders', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/work-orders');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('creates a work order with defaults (WO-1, WO-5)', async () => {
    const { agent: a } = await registerUser('wo@example.com');
    const res = await a.post('/api/v1/work-orders').send({ title: 'Fix AC unit' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'Fix AC unit',
      status: 'pending',
      priority: 'medium',
      version: 1,
    });
    expect(res.body.data.owner.email).toBe('wo@example.com');
    expect(res.body.data).not.toHaveProperty('deletedAt');
  });

  it('rejects extra fields on create (WO-8)', async () => {
    const { agent: a } = await registerUser('extra@example.com');
    const res = await a
      .post('/api/v1/work-orders')
      .send({ title: 'Valid title', owner: 'some-other-id', hacked: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const list = await a.get('/api/v1/work-orders');
    expect(list.body.data.items).toHaveLength(0);
  });

  it('isolates owners: a user only sees their own work orders (WO-2)', async () => {
    const { agent: a } = await registerUser('alicewo@example.com');
    const { agent: b } = await registerUser('bobwo@example.com');
    await createWorkOrder(a, { title: 'Alice job' });
    await createWorkOrder(b, { title: 'Bob job' });

    const listA = await a.get('/api/v1/work-orders');
    expect(listA.body.data.items.map((w: { title: string }) => w.title)).toEqual(['Alice job']);

    const listB = await b.get('/api/v1/work-orders');
    expect(listB.body.data.items.map((w: { title: string }) => w.title)).toEqual(['Bob job']);
  });

  it('returns 404 when fetching another owner work order (WO-10)', async () => {
    const { agent: a } = await registerUser('cwo@example.com');
    const { agent: b } = await registerUser('dwo@example.com');
    const created = await createWorkOrder(a, { title: 'Secret job' });
    const id = created.body.data.id;

    const other = await b.get(`/api/v1/work-orders/${id}`);
    expect(other.status).toBe(404);

    const owner = await a.get(`/api/v1/work-orders/${id}`);
    expect(owner.status).toBe(200);
  });

  it('returns 400 for an invalid id (WO-10)', async () => {
    const { agent: a } = await registerUser('invalid@example.com');
    const res = await a.get('/api/v1/work-orders/not-an-objectid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects stale version updates with 409 CONFLICT_VERSION (WO-6/9)', async () => {
    const { agent: a } = await registerUser('stale@example.com');
    const created = await createWorkOrder(a, { title: 'Stale job' });
    const id = created.body.data.id;

    const ok = await a.patch(`/api/v1/work-orders/${id}`).send({ status: 'in_progress', version: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.version).toBe(2);

    const stale = await a.patch(`/api/v1/work-orders/${id}`).send({ status: 'done', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT_VERSION');
  });

  it('requires version on update (WO-6/9)', async () => {
    const { agent: a } = await registerUser('noversion@example.com');
    const created = await createWorkOrder(a, { title: 'Version job' });
    const res = await a.patch(`/api/v1/work-orders/${created.body.data.id}`).send({ status: 'done' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('soft deletes, hides from lists, and is idempotent (WO-7)', async () => {
    const { agent: a } = await registerUser('soft@example.com');
    const created = await createWorkOrder(a, { title: 'Delete me' });
    const id = created.body.data.id;

    const del = await a.delete(`/api/v1/work-orders/${id}`).send({ version: 1 });
    expect(del.status).toBe(204);

    const get = await a.get(`/api/v1/work-orders/${id}`);
    expect(get.status).toBe(404);

    const list = await a.get('/api/v1/work-orders');
    expect(list.body.data.items).toHaveLength(0);

    // idempotent: deleting an already-deleted order with same version → 204
    const again = await a.delete(`/api/v1/work-orders/${id}`).send({ version: 1 });
    expect(again.status).toBe(204);
  });

  it('escapes regex in search (WO-4)', async () => {
    const { agent: a } = await registerUser('regex@example.com');
    await createWorkOrder(a, { title: 'Job with [brackets]' });
    await createWorkOrder(a, { title: 'Plain job' });

    const special = await a.get('/api/v1/work-orders?search=%5Bbrackets%5D');
    expect(special.body.data.items).toHaveLength(1);
    expect(special.body.data.items[0].title).toBe('Job with [brackets]');

    // a regex that would match everything must NOT match anything (escaped literally)
    const wild = await a.get('/api/v1/work-orders?search=.*');
    expect(wild.body.data.items).toHaveLength(0);
  });

  it('filters by status and priority (WO-4)', async () => {
    const { agent: a } = await registerUser('filter@example.com');
    await createWorkOrder(a, { title: 'Pending low', priority: 'low' });
    await createWorkOrder(a, { title: 'Done high', status: 'done', priority: 'high' });

    const done = await a.get('/api/v1/work-orders?status=done');
    expect(done.body.data.items.map((w: { title: string }) => w.title)).toEqual(['Done high']);

    const low = await a.get('/api/v1/work-orders?priority=low');
    expect(low.body.data.items.map((w: { title: string }) => w.title)).toEqual(['Pending low']);
  });

  it('paginates with a cursor (WO-3)', async () => {
    const { agent: a } = await registerUser('page@example.com');
    for (let i = 1; i <= 25; i++) {
      await a.post('/api/v1/work-orders').send({ title: `Job ${String(i).padStart(2, '0')}` });
    }
    const first = await a.get('/api/v1/work-orders?limit=10');
    expect(first.body.data.items).toHaveLength(10);
    expect(first.body.data.nextCursor).toBeTruthy();

    const second = await a.get(`/api/v1/work-orders?limit=10&cursor=${encodeURIComponent(first.body.data.nextCursor)}`);
    expect(second.body.data.items).toHaveLength(10);
    const titles = [...first.body.data.items, ...second.body.data.items].map((w: { title: string }) => w.title);
    expect(titles).toEqual(Array.from({ length: 20 }, (_, i) => `Job ${String(25 - i).padStart(2, '0')}`));

    const third = await a.get(`/api/v1/work-orders?limit=10&cursor=${encodeURIComponent(second.body.data.nextCursor)}`);
    expect(third.body.data.items).toHaveLength(5);
    expect(third.body.data.nextCursor).toBeNull();
  });

  it('rejects a tampered cursor (WO-3)', async () => {
    const { agent: a } = await registerUser('tamper@example.com');
    await createWorkOrder(a, { title: 'Tamper job' });
    const res = await a.get('/api/v1/work-orders?cursor=forged.cursor.value');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});