import { makeToolCall, providerResult } from './ai-helpers.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SseEvent } from '@workorders/shared';
import { copilotRuntime } from '../src/agent/runtime.js';
import { agentRepo } from '../src/repositories/agent.repo.js';
import { userRepo } from '../src/repositories/user.repo.js';
import type { Actor } from '../src/utils/actor.js';
import type { Role } from '@workorders/shared';

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
    providerModel: 'unit-test-model',
    ProviderError,
  };
});

vi.mock('../src/agent/provider.js', () => providerMock);

async function createUser(role: Role = 'user'): Promise<{ id: string; actor: Actor }> {
  const user = await userRepo.createUser({
    email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    passwordHash: 'test-hash',
    name: 'Test User',
    role,
  });
  return { id: user._id.toString(), actor: { id: user._id.toString(), role, kind: 'human' } };
}

async function runTurn(actor: Actor): Promise<{ runId: string; events: SseEvent[] }> {
  const session = await agentRepo.createSession(actor.id);
  const events: SseEvent[] = [];
  const run = await copilotRuntime.runTurn({
    sessionId: session._id.toString(),
    actor,
    content: 'hello',
    onEvent: (event) => events.push(event),
  });
  return { runId: run.id, events };
}

describe('copilotRuntime.runTurn', () => {
  beforeEach(() => {
    providerMock.chatStream.mockReset();
    providerMock.chatComplete.mockReset();
  });

  it('completes with message_done when the provider returns no tool calls', async () => {
    const { actor } = await createUser();
    providerMock.chatStream.mockResolvedValue(
      providerResult({ content: 'All done', inputTokens: 12, outputTokens: 7 }),
    );
    const { runId, events } = await runTurn(actor);
    expect(events).toContainEqual(
      expect.objectContaining({ event: 'message_done', content: 'All done', inputTokens: 12, outputTokens: 7 }),
    );
    const run = await agentRepo.findRunById(runId);
    expect(run?.status).toBe('complete');
    expect(run?.inputTokens).toBe(12);
    expect(run?.outputTokens).toBe(7);
  });

  it('reports an error tool_result for an unknown tool and still completes', async () => {
    const { actor } = await createUser();
    providerMock.chatStream
      .mockResolvedValueOnce(providerResult({ content: 'Calling a tool', tool_calls: [makeToolCall('c1', 'no_such_tool', {})] }))
      .mockResolvedValue(providerResult({ content: 'ok' }));
    const { runId, events } = await runTurn(actor);
    expect(events).toContainEqual(
      expect.objectContaining({ event: 'tool_result', toolCallId: 'c1', outcome: 'error' }),
    );
    const run = await agentRepo.findRunById(runId);
    expect(run?.status).toBe('complete');
    const calls = await agentRepo.listToolCallsForRun(runId);
    expect(calls[0]).toMatchObject({ tool: 'no_such_tool', outcome: 'error', result: 'Unknown tool' });
  });

  it('reports an error tool_result for malformed tool-call JSON arguments', async () => {
    const { actor } = await createUser();
    providerMock.chatStream
      .mockResolvedValueOnce(
        providerResult({
          content: 'Calling a tool',
          tool_calls: [{ id: 'c1', type: 'function', function: { name: 'create_work_order', arguments: '{not json' } }],
        }),
      )
      .mockResolvedValue(providerResult({ content: 'ok' }));
    const { runId, events } = await runTurn(actor);
    expect(events).toContainEqual(
      expect.objectContaining({ event: 'tool_result', toolCallId: 'c1', outcome: 'error' }),
    );
    const calls = await agentRepo.listToolCallsForRun(runId);
    expect(calls[0]).toMatchObject({ outcome: 'error', result: 'Malformed arguments' });
  });

  it('reports an error tool_result when tool arguments fail zod validation', async () => {
    const { actor } = await createUser();
    providerMock.chatStream
      .mockResolvedValueOnce(
        providerResult({ content: 'Calling a tool', tool_calls: [makeToolCall('c1', 'update_work_order', { id: 'x', priority: 'urgent' })] }),
      )
      .mockResolvedValue(providerResult({ content: 'ok' }));
    const { runId, events } = await runTurn(actor);
    expect(events).toContainEqual(
      expect.objectContaining({ event: 'tool_result', toolCallId: 'c1', outcome: 'error' }),
    );
    const calls = await agentRepo.listToolCallsForRun(runId);
    expect(calls[0]?.outcome).toBe('error');
  });

  it('blocks write tools for the viewer role without staging an approval', async () => {
    const { actor } = await createUser('viewer');
    providerMock.chatStream
      .mockResolvedValueOnce(
        providerResult({ content: 'Calling a tool', tool_calls: [makeToolCall('c1', 'create_work_order', { title: 'Sneaky' })] }),
      )
      .mockResolvedValue(providerResult({ content: 'ok' }));
    const { runId, events } = await runTurn(actor);
    expect(events).toContainEqual(
      expect.objectContaining({ event: 'tool_result', toolCallId: 'c1', outcome: 'blocked' }),
    );
    expect(events.some((event) => event.event === 'tool_approval_required')).toBe(false);
    const calls = await agentRepo.listToolCallsForRun(runId);
    expect(calls[0]).toMatchObject({ outcome: 'blocked' });
  });

  it('blocks writes to work-order ids not seen in the run', async () => {
    const { actor } = await createUser();
    providerMock.chatStream
      .mockResolvedValueOnce(
        providerResult({ content: 'Calling a tool', tool_calls: [makeToolCall('c1', 'update_work_order', { id: 'not-seen-id', status: 'done' })] }),
      )
      .mockResolvedValue(providerResult({ content: 'ok' }));
    const { runId, events } = await runTurn(actor);
    expect(events).toContainEqual(
      expect.objectContaining({ event: 'tool_result', toolCallId: 'c1', outcome: 'blocked' }),
    );
    const calls = await agentRepo.listToolCallsForRun(runId);
    expect(calls[0]?.result).toMatch(/not seen/);
  });

  it('ends the run with AI_BUDGET_EXCEEDED when the user daily spend is exhausted', async () => {
    const { id, actor } = await createUser();
    await agentRepo.chargeSpend(`user:${id}`, 100);
    const session = await agentRepo.createSession(id);
    const events: SseEvent[] = [];
    await expect(
      copilotRuntime.runTurn({ sessionId: session._id.toString(), actor, content: 'hello', onEvent: (event) => events.push(event) }),
    ).rejects.toMatchObject({ status: 429, code: 'AI_BUDGET_EXCEEDED' });
    const runs = await agentRepo.listRunsForUser(id);
    expect(runs[0]).toMatchObject({ status: 'error', errorCode: 'AI_BUDGET_EXCEEDED' });
  });

  it('ends the run budget_exceeded once AI_MAX_STEPS_PER_RUN is exhausted', async () => {
    const { actor } = await createUser();
    providerMock.chatStream.mockResolvedValue(
      providerResult({ content: 'Calling a tool', tool_calls: [makeToolCall('c1', 'get_profile', {})] }),
    );
    const { runId } = await runTurn(actor);
    const run = await agentRepo.findRunById(runId);
    expect(run?.status).toBe('budget_exceeded');
    expect(providerMock.chatStream).toHaveBeenCalledTimes(3);
  });
});