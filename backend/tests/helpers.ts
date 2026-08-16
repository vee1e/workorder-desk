import request from 'supertest';
import { app } from '../src/app.js';

export const agent = (): ReturnType<typeof request.agent> => request.agent(app);

export async function registerUser(
  email: string,
  password = 'Password123',
  name = 'Test User',
): Promise<{ res: request.Response; agent: ReturnType<typeof request.agent> }> {
  const a = request.agent(app);
  const res = await a.post('/api/v1/auth/register').send({ email, password, name });
  return { res, agent: a };
}

export async function loginUser(
  email: string,
  password = 'Password123',
): Promise<{ res: request.Response; agent: ReturnType<typeof request.agent> }> {
  const a = request.agent(app);
  const res = await a.post('/api/v1/auth/login').send({ email, password });
  return { res, agent: a };
}

export async function createWorkOrder(
  a: ReturnType<typeof request.agent>,
  overrides: Partial<{ title: string; description: string | null; priority: string; status: string }> = {},
): Promise<request.Response> {
  return a.post('/api/v1/work-orders').send({
    title: 'Fix leaking pipe',
    ...overrides,
  });
}

export function cookieFrom(res: request.Response, name: string): string | undefined {
  const setCookiesHeader = res.headers['set-cookie'];
  if (!setCookiesHeader) return undefined;
  const setCookies = Array.isArray(setCookiesHeader) ? setCookiesHeader : [setCookiesHeader];
  for (const sc of setCookies) {
    const first = sc.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0 && first.slice(0, eq) === name) return first;
  }
  return undefined;
}

export async function createAdmin(): Promise<{ res: request.Response; agent: ReturnType<typeof request.agent> }> {
  const a = request.agent(app);
  const res = await a.post('/api/v1/auth/register').send({
    email: 'boss@example.com',
    password: 'AdminPass123',
    name: 'Boss Admin',
  });
  // promote to admin directly in the DB for tests
  const mongoose = await import('mongoose');
  await mongoose.connection.db!.collection('users').updateOne({ email: 'boss@example.com' }, { $set: { role: 'admin' } });
  return { res, agent: a };
}