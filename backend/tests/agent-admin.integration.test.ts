import { importAIApp, providerResult, type TestAgent } from './ai-helpers.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { agentRepo } from '../src/repositories/agent.repo.js';
import { userRepo } from '../src/repositories/user.repo.js';
import { workOrderRepo } from '../src/repositories/work-order.repo.js';
import { createAdmin } from './helpers.js';

const providerMock = vi.hoisted(() => {
  class ProviderError extends Error {
    constructor(
      message: string,
      public readonly code: 'timeout' | 'network' | 'bad_status' | 'invalid_response' | 'size',
    ) {
      super(message);
      this.name = 'ProviderError';
    }
  }
  return {
    chatStream: vi.fn(),
    chatComplete: vi.fn(),
    providerModel: 'agent-admin-test-model',
    ProviderError,
  };
});

vi.mock('../src/agent/provider.js', () => providerMock);

let app: Express;

beforeAll(async () => {
  app = await importAIApp();
});

beforeEach(() => {
  providerMock.chatStream.mockReset();
  providerMock.chatComplete.mockReset();
});

async function register(agent: TestAgent, email: string): Promise<{ userId: string }> {
  const res = await agent.post('/api/v1/auth/register').send({ email, password: 'Password123', name: 'Test User' });
  expect(res.status).toBe(201);
  return { userId: res.body.data.id };
}

describe('agent admin API', () => {
  it('returns the triage config, creating it on demand (GET /triage)', async () => {
    const { agent: admin } = await createAdmin();
    const res = await admin.get('/api/v1/admin/agents/triage');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'triage',
      mode: 'suggest',
      enabled: true,
      workingHours: '*',
      dailyActionCap: 50,
    });
    expect(typeof res.body.data.updatedAt).toBe('string');
  });

  it('updates the triage config (PATCH /triage/config)', async () => {
    const { agent: admin } = await createAdmin();
    await admin.get('/api/v1/admin/agents/triage');
    const res = await admin.patch('/api/v1/admin/agents/triage/config').send({ mode: 'auto-apply' });
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('auto-apply');
    expect(res.body.data.updatedBy).not.toBeNull();
    const after = await agentRepo.getAgentConfig('triage');
    expect(after?.mode).toBe('auto-apply');
  });

  it('rejects an unknown config field (PATCH /triage/config)', async () => {
    const { agent: admin } = await createAdmin();
    const res = await admin.patch('/api/v1/admin/agents/triage/config').send({ bogus: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('disables the triage agent (POST /disable)', async () => {
    const { agent: admin } = await createAdmin();
    await admin.get('/api/v1/admin/agents/triage');
    const res = await admin.post('/api/v1/admin/agents/disable').send({});
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ enabled: false });
    const config = await admin.get('/api/v1/admin/agents/triage');
    expect(config.body.data.enabled).toBe(false);
  });

  it('runs triage manually and exposes the run via /runs and /runs/:id', async () => {
    const { agent: admin } = await createAdmin();
    const owner = await userRepo.createUser({
      email: `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      passwordHash: 'test-hash',
      name: 'Owner',
    });
    const wo = await workOrderRepo.create({
      ownerId: owner._id.toString(),
      title: 'Triage target',
      priority: 'medium',
      status: 'pending',
    });
    providerMock.chatComplete.mockResolvedValue(
      providerResult({
        content: JSON.stringify({ summary: 'Needs review', suggestedPriority: 'high', flagForDispatcher: true }),
        inputTokens: 40,
        outputTokens: 15,
      }),
    );

    const run = await admin.post('/api/v1/admin/agents/triage/run').send({ workOrderId: wo._id.toString() });
    expect(run.status).toBe(200);
    expect(run.body.data.outcome).toBe('done');

    const suggestions = await agentRepo.listSuggestionsForWorkOrder(wo._id.toString());
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ summary: 'Needs review', suggestedPriority: 'high', flagForDispatcher: true });

    const runs = await admin.get('/api/v1/admin/agents/runs');
    expect(runs.status).toBe(200);
    expect(runs.body.data).toMatchObject({ page: 1, limit: 20 });
    expect(runs.body.data.total).toBe(1);
    expect(runs.body.data.items[0]).toMatchObject({
      status: 'complete',
      mode: 'autonomous',
      agentName: 'triage',
      inputTokens: 40,
      outputTokens: 15,
      finishedAt: expect.any(String),
    });

    const runId = runs.body.data.items[0].id;
    const detail = await admin.get(`/api/v1/admin/agents/runs/${runId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.run).toMatchObject({ id: runId, status: 'complete' });
    expect(detail.body.data.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user', 'assistant']);
    expect(detail.body.data.toolCalls[0]).toMatchObject({ tool: 'triage_propose', outcome: 'executed' });
  });

  it('returns 404 for an unknown run id (GET /runs/:id)', async () => {
    const { agent: admin } = await createAdmin();
    const res = await admin.get('/api/v1/admin/agents/runs/000000000000000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects non-admin users with 403 FORBIDDEN', async () => {
    const a = request.agent(app);
    await register(a, 'plain-agent@example.com');
    expect((await a.get('/api/v1/admin/agents/triage')).status).toBe(403);
    expect((await a.patch('/api/v1/admin/agents/triage/config').send({ mode: 'auto-apply' })).status).toBe(403);
    expect((await a.post('/api/v1/admin/agents/disable').send({})).status).toBe(403);
    expect((await a.post('/api/v1/admin/agents/triage/run').send({})).status).toBe(403);
    expect((await a.get('/api/v1/admin/agents/runs')).status).toBe(403);
  });

  it('requires authentication (401)', async () => {
    const res = await request(app).get('/api/v1/admin/agents/triage');
    expect(res.status).toBe(401);
  });
});
