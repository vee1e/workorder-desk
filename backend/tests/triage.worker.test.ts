import { providerResult } from './ai-helpers.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { ensureTriageConfig, isWorkingHours, runTriage } from '../src/agent/triage.js';
import { agentRepo } from '../src/repositories/agent.repo.js';
import { userRepo } from '../src/repositories/user.repo.js';
import { workOrderRepo } from '../src/repositories/work-order.repo.js';
import { OutboxEvent } from '../src/models/outbox-event.model.js';
import { TriageSuggestion } from '../src/models/triage-suggestion.model.js';
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
    providerModel: 'triage-test-model',
    ProviderError,
  };
});

vi.mock('../src/agent/provider.js', () => providerMock);

const proposal = (overrides?: Record<string, unknown>): string =>
  JSON.stringify({ summary: 'Needs attention', suggestedPriority: 'high', flagForDispatcher: false, ...overrides });

async function makeWorkOrder(options: { aiEnabled?: boolean; priority?: 'low' | 'medium' | 'high' } = {}): Promise<{
  user: { id: string };
  wo: { id: string };
}> {
  const user = await userRepo.createUser({
    email: `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    passwordHash: 'test-hash',
    name: 'Owner',
  });
  if (options.aiEnabled === false) await userRepo.updateAiEnabled(user._id.toString(), false);
  const wo = await workOrderRepo.create({
    ownerId: user._id.toString(),
    title: 'Triage me',
    priority: options.priority ?? 'medium',
    status: 'pending',
  });
  return { user: { id: user._id.toString() }, wo: { id: wo._id.toString() } };
}

describe('triage agent', () => {
  beforeEach(() => {
    providerMock.chatStream.mockReset();
    providerMock.chatComplete.mockReset();
  });

  it('creates the triage config singleton', async () => {
    expect(await agentRepo.getAgentConfig('triage')).toBeNull();
    await ensureTriageConfig();
    const config = await agentRepo.getAgentConfig('triage');
    expect(config).not.toBeNull();
    expect(config?.enabled).toBe(true);
    await ensureTriageConfig();
    expect((await agentRepo.getAgentConfig('triage'))?._id.toString()).toBe(config?._id.toString());
  });

  it('triages a work order and records a suggestion without applying it', async () => {
    const { wo } = await makeWorkOrder();
    providerMock.chatComplete.mockResolvedValue(
      providerResult({ content: proposal(), inputTokens: 100, outputTokens: 20 }),
    );
    const outcome = await runTriage(wo.id);
    expect(outcome).toBe('done');
    const suggestions = await TriageSuggestion.find({ workOrderId: wo.id });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ applied: false, suggestedPriority: 'high', flagForDispatcher: false });
    const runs = (await agentRepo.listAdminRuns(1, 10)).items.filter((run) => run.mode === 'autonomous');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'complete', agentName: 'triage' });
    const calls = await agentRepo.listToolCallsForRun(runs[0]!._id.toString());
    expect(calls[0]).toMatchObject({ tool: 'triage_propose', outcome: 'executed' });
  });

  it('auto-applies the suggested priority in auto-apply mode', async () => {
    const { wo } = await makeWorkOrder({ priority: 'low' });
    await ensureTriageConfig();
    await agentRepo.updateAgentConfig('triage', { mode: 'auto-apply' }, 'admin');
    providerMock.chatComplete.mockResolvedValue(providerResult({ content: proposal({ suggestedPriority: 'high' }) }));
    const outcome = await runTriage(wo.id);
    expect(outcome).toBe('done');
    const fresh = await WorkOrder.findById(wo.id);
    expect(fresh?.priority).toBe('high');
    const suggestions = await TriageSuggestion.find({ workOrderId: wo.id });
    expect(suggestions[0]?.applied).toBe(true);
  });

  it('skips triage when the owner has AI disabled', async () => {
    const { wo } = await makeWorkOrder({ aiEnabled: false });
    const outcome = await runTriage(wo.id);
    expect(outcome).toBe('skipped');
    expect(providerMock.chatComplete).not.toHaveBeenCalled();
    expect(await TriageSuggestion.countDocuments()).toBe(0);
  });

  it('fails after exhausting attempts when the provider returns invalid JSON', async () => {
    const { wo } = await makeWorkOrder();
    providerMock.chatComplete.mockResolvedValue(providerResult({ content: 'definitely not json' }));
    const outcome = await runTriage(wo.id);
    expect(outcome).toBe('failed');
    expect(providerMock.chatComplete).toHaveBeenCalledTimes(3);
    const runs = (await agentRepo.listAdminRuns(1, 10)).items.filter((run) => run.mode === 'autonomous');
    expect(runs[0]).toMatchObject({ status: 'error', errorCode: 'AI_UNAVAILABLE' });
  });

  it('skips triage when outside the configured working hours', async () => {
    const { wo } = await makeWorkOrder();
    await ensureTriageConfig();
    const hour = new Date().getUTCHours();
    const excluding = (hour + 2) % 24;
    await agentRepo.updateAgentConfig('triage', { workingHours: `${excluding}-${excluding}` }, 'admin');
    const outcome = await runTriage(wo.id);
    expect(outcome).toBe('skipped');
    expect(providerMock.chatComplete).not.toHaveBeenCalled();
  });

  it('skips triage when the daily action cap is already reached', async () => {
    const { wo } = await makeWorkOrder();
    await ensureTriageConfig();
    await agentRepo.updateAgentConfig('triage', { dailyActionCap: 1 }, 'admin');
    await agentRepo.createSuggestion({
      workOrderId: wo.id,
      runId: new Types.ObjectId().toString(),
      summary: 'Already flagged',
      suggestedPriority: 'low',
      flagForDispatcher: false,
      applied: false,
    });
    const outcome = await runTriage(wo.id);
    expect(outcome).toBe('skipped');
    expect(providerMock.chatComplete).not.toHaveBeenCalled();
  });

  it('skips triage when the agent daily spend budget is exhausted', async () => {
    const { wo } = await makeWorkOrder();
    await agentRepo.chargeSpend('agent:triage', 100);
    const outcome = await runTriage(wo.id);
    expect(outcome).toBe('skipped');
    expect(providerMock.chatComplete).not.toHaveBeenCalled();
  });

  it('returns retry when the provider fails transiently and records AI_UNAVAILABLE', async () => {
    const { wo } = await makeWorkOrder();
    providerMock.chatComplete.mockRejectedValue(new providerMock.ProviderError('upstream down', 'network'));
    const outcome = await runTriage(wo.id);
    expect(outcome).toBe('retry');
    const runs = (await agentRepo.listAdminRuns(1, 10)).items.filter((run) => run.mode === 'autonomous');
    expect(runs[0]).toMatchObject({ status: 'error', errorCode: 'AI_UNAVAILABLE' });
  });

  it('claims outbox events with a lease and recovers expired leases', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    await agentRepo.enqueueOutbox({ type: 'work_order.created', payloadRef: 'wo-lease-1' });
    await agentRepo.enqueueOutbox({ type: 'work_order.created', payloadRef: 'wo-lease-2' });
    const first = await agentRepo.claimOutboxEvent(now, 15_000);
    expect(first).not.toBeNull();
    expect(first?.status).toBe('processing');
    expect(first?.attempts).toBe(1);
    // a second event is still pending → claimed next
    const second = await agentRepo.claimOutboxEvent(new Date(now.getTime() + 1000), 15_000);
    expect(second).not.toBeNull();
    expect(second?.payloadRef).not.toBe(first?.payloadRef);
    // both are now processing with live leases → nothing to claim
    const none = await agentRepo.claimOutboxEvent(new Date(now.getTime() + 2000), 15_000);
    expect(none).toBeNull();
    // crash recovery: expired lease → the event is claimable again
    await OutboxEvent.updateMany({}, { $set: { leasedUntil: new Date(now.getTime() - 1000) } });
    const recovered = await agentRepo.claimOutboxEvent(new Date(now.getTime() + 3000), 15_000);
    expect(recovered).not.toBeNull();
    expect(recovered?._id.toString()).toBe(first?._id.toString());
  });

  it('evaluates working-hours specs', () => {
    expect(isWorkingHours('*', new Date('2026-01-01T10:00:00Z'))).toBe(true);
    expect(isWorkingHours('09-17', new Date('2026-01-01T10:00:00Z'))).toBe(true);
    expect(isWorkingHours('09-17', new Date('2026-01-01T20:00:00Z'))).toBe(false);
    expect(isWorkingHours('bogus', new Date('2026-01-01T10:00:00Z'))).toBe(false);
  });
});