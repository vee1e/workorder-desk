import { importAIApp, makeToolCall, providerResult, startSSE, waitFor, type TestAgent } from './ai-helpers.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { agentRepo } from '../src/repositories/agent.repo.js';
import { User } from '../src/models/user.model.js';
import { WorkOrder } from '../src/models/work-order.model.js';

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
    providerModel: 'integration-test-model',
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

function approveCall(title: string) {
  return providerResult({ content: 'Calling a tool', tool_calls: [makeToolCall('c1', 'create_work_order', { title })] });
}

describe('copilot HTTP API', () => {
  it('creates a session and lists it (201 / GET)', async () => {
    const a = request.agent(app);
    const { userId } = await register(a, 'sess@example.com');
    const created = await a.post('/api/v1/ai/sessions').send({});
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'active', userId });
    const list = await a.get('/api/v1/ai/sessions');
    expect(list.status).toBe(200);
    expect(list.body.data.map((session: { id: string }) => session.id)).toContain(created.body.data.id);
  });

  it('streams a message_done SSE event for a content-only turn', async () => {
    const a = request.agent(app);
    const { userId } = await register(a, 'sse@example.com');
    const session = await a.post('/api/v1/ai/sessions').send({});
    providerMock.chatStream.mockResolvedValue(
      providerResult({ content: 'Hello, world', inputTokens: 8, outputTokens: 3 }),
    );
    const res = await a.post(`/api/v1/ai/sessions/${session.body.data.id}/messages`).send({ content: 'hi' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: message_done');
    expect(res.text).toContain('Hello, world');
    const runs = await agentRepo.listRunsForUser(userId);
    expect(runs[0]).toMatchObject({ status: 'complete' });
  });

  it('runs the full approval flow: tool_approval_required → decide approve → executed', async () => {
    const a = request.agent(app);
    const { userId } = await register(a, 'approve@example.com');
    const session = await a.post('/api/v1/ai/sessions').send({});
    providerMock.chatStream
      .mockResolvedValueOnce(approveCall('Agent-created order'))
      .mockResolvedValue(providerResult({ content: 'Created it' }));
    const messagesPromise = startSSE(a
        .post(`/api/v1/ai/sessions/${session.body.data.id}/messages`)
        .send({ content: 'create a work order' }));
    const run = await waitFor(async () => (await agentRepo.listRunsForUser(userId)).find((r) => r.status === 'running'));
    const toolCall = await waitFor(async () =>
      (await agentRepo.listToolCallsForRun(run._id.toString())).find((call) => call.approval?.status === 'pending'),
    );
    expect(toolCall.tool).toBe('create_work_order');
    const decide = await a.post(`/api/v1/ai/tool-calls/${toolCall._id.toString()}/decide`).send({ approve: true });
    expect(decide.status).toBe(200);
    expect(decide.body.data).toMatchObject({ id: toolCall._id.toString(), tool: 'create_work_order', outcome: 'approved' });
    const sse = await messagesPromise;
    expect(sse.status).toBe(200);
    expect(sse.text).toContain('event: tool_approval_required');
    expect(sse.text).toContain('"outcome":"executed"');
    expect(sse.text).toContain('event: message_done');
    expect(await WorkOrder.findOne({ title: 'Agent-created order' })).not.toBeNull();
  });

  it('rejects the approval and does not execute the write', async () => {
    const a = request.agent(app);
    const { userId } = await register(a, 'reject@example.com');
    const session = await a.post('/api/v1/ai/sessions').send({});
    providerMock.chatStream
      .mockResolvedValueOnce(approveCall('Rejected order'))
      .mockResolvedValue(providerResult({ content: 'OK' }));
    const messagesPromise = startSSE(a
        .post(`/api/v1/ai/sessions/${session.body.data.id}/messages`)
        .send({ content: 'do it' }));
    const run = await waitFor(async () => (await agentRepo.listRunsForUser(userId)).find((r) => r.status === 'running'));
    const toolCall = await waitFor(async () =>
      (await agentRepo.listToolCallsForRun(run._id.toString())).find((call) => call.approval?.status === 'pending'),
    );
    const decide = await a.post(`/api/v1/ai/tool-calls/${toolCall._id.toString()}/decide`).send({ approve: false });
    expect(decide.status).toBe(200);
    const sse = await messagesPromise;
    expect(sse.text).toContain('"outcome":"rejected"');
    expect(await WorkOrder.countDocuments({ title: 'Rejected order' })).toBe(0);
  });

  it('forbids another user from deciding an approval (403 FORBIDDEN)', async () => {
    const a = request.agent(app);
    const { userId } = await register(a, 'alice@example.com');
    const b = request.agent(app);
    await register(b, 'bob@example.com');
    const session = await a.post('/api/v1/ai/sessions').send({});
    providerMock.chatStream
      .mockResolvedValueOnce(approveCall('Alice order'))
      .mockResolvedValue(providerResult({ content: 'OK' }));
    const messagesPromise = startSSE(a
        .post(`/api/v1/ai/sessions/${session.body.data.id}/messages`)
        .send({ content: 'go' }));
    const run = await waitFor(async () => (await agentRepo.listRunsForUser(userId)).find((r) => r.status === 'running'));
    const toolCall = await waitFor(async () =>
      (await agentRepo.listToolCallsForRun(run._id.toString())).find((call) => call.approval?.status === 'pending'),
    );
    const decide = await b.post(`/api/v1/ai/tool-calls/${toolCall._id.toString()}/decide`).send({ approve: true });
    expect(decide.status).toBe(403);
    expect(decide.body.error.code).toBe('FORBIDDEN');
    // let the run finish so the open SSE request resolves
    await a.post(`/api/v1/ai/tool-calls/${toolCall._id.toString()}/decide`).send({ approve: true });
    await messagesPromise;
  });

  it('blocks a viewer write tool without an approval modal', async () => {
    const a = request.agent(app);
    await register(a, 'viewer2@example.com');
    await User.updateOne({ email: 'viewer2@example.com' }, { $set: { role: 'viewer' } });
    const session = await a.post('/api/v1/ai/sessions').send({});
    expect(session.status).toBe(201);
    providerMock.chatStream
      .mockResolvedValueOnce(approveCall('Viewer write'))
      .mockResolvedValue(providerResult({ content: 'OK' }));
    const res = await a.post(`/api/v1/ai/sessions/${session.body.data.id}/messages`).send({ content: 'create' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('"outcome":"blocked"');
    expect(res.text).not.toContain('tool_approval_required');
  });

  it('rejects a new session while an approval is pending (409 AI_APPROVAL_PENDING)', async () => {
    const a = request.agent(app);
    const { userId } = await register(a, 'pending@example.com');
    const session = await a.post('/api/v1/ai/sessions').send({});
    providerMock.chatStream
      .mockResolvedValueOnce(approveCall('Pending order'))
      .mockResolvedValue(providerResult({ content: 'OK' }));
    const messagesPromise = startSSE(a
        .post(`/api/v1/ai/sessions/${session.body.data.id}/messages`)
        .send({ content: 'go' }));
    const run = await waitFor(async () => (await agentRepo.listRunsForUser(userId)).find((r) => r.status === 'running'));
    await waitFor(async () =>
      (await agentRepo.listToolCallsForRun(run._id.toString())).find((call) => call.approval?.status === 'pending'),
    );
    const second = await a.post('/api/v1/ai/sessions').send({});
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('AI_APPROVAL_PENDING');
    const toolCall = (await agentRepo.listToolCallsForRun(run._id.toString())).find(
      (call) => call.approval?.status === 'pending',
    )!;
    await a.post(`/api/v1/ai/tool-calls/${toolCall._id.toString()}/decide`).send({ approve: true });
    await messagesPromise;
  });
});