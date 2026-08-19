import type {
  AgentApprovalStatus,
  AgentRunMode,
  AgentRunStatus,
  AgentToolOutcome,
  CopilotSessionStatus,
  WorkOrderPriority,
} from '@workorders/shared';
import { CopilotSession, type CopilotSessionDoc } from '../models/copilot-session.model.js';
import { AgentRun, type AgentRunDoc } from '../models/agent-run.model.js';
import { AgentMessage, type AgentMessageDoc } from '../models/agent-message.model.js';
import { AgentToolCall, type AgentToolCallDoc } from '../models/agent-tool-call.model.js';
import { OutboxEvent, type OutboxEventDoc } from '../models/outbox-event.model.js';
import { TriageSuggestion, type TriageSuggestionDoc } from '../models/triage-suggestion.model.js';
import { AgentConfig, type AgentConfigDoc } from '../models/agent-config.model.js';
import { AgentConfigAudit } from '../models/agent-config-audit.model.js';
import { AgentSpend } from '../models/agent-spend.model.js';

const TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const agentRepo = {
  async createSession(userId: string): Promise<CopilotSessionDoc> {
    return CopilotSession.create({ userId });
  },

  async findSessionById(id: string): Promise<CopilotSessionDoc | null> {
    return CopilotSession.findById(id).lean();
  },

  async listSessionsForUser(userId: string): Promise<CopilotSessionDoc[]> {
    return CopilotSession.find({ userId }).sort({ createdAt: -1 }).lean();
  },

  async archiveSession(id: string): Promise<void> {
    await CopilotSession.updateOne({ _id: id }, { $set: { status: 'archived' } });
  },

  async setSessionStatus(id: string, status: CopilotSessionStatus): Promise<void> {
    await CopilotSession.updateOne({ _id: id }, { $set: { status } });
  },

  async createRun(input: {
    sessionId: string;
    userId: string;
    mode: AgentRunMode;
    agentName?: string;
    model: string;
  }): Promise<AgentRunDoc> {
    return AgentRun.create({
      sessionId: input.sessionId,
      userId: input.userId,
      mode: input.mode,
      agentName: input.agentName,
      model: input.model,
    });
  },

  async findRunById(id: string): Promise<AgentRunDoc | null> {
    return AgentRun.findById(id).lean();
  },

  async finishRun(
    id: string,
    patch: { status: AgentRunStatus; finishedAt: Date; errorCode?: string; inputTokens?: number; outputTokens?: number },
  ): Promise<void> {
    const set: Record<string, unknown> = { status: patch.status, finishedAt: patch.finishedAt };
    if (patch.errorCode !== undefined) set.errorCode = patch.errorCode;
    if (patch.inputTokens !== undefined) set.inputTokens = patch.inputTokens;
    if (patch.outputTokens !== undefined) set.outputTokens = patch.outputTokens;
    await AgentRun.updateOne({ _id: id }, { $set: set });
  },

  async hasNonTerminalRun(sessionId: string): Promise<boolean> {
    return (await AgentRun.exists({ sessionId, status: 'running' })) !== null;
  },

  async listRunsForUser(userId: string): Promise<AgentRunDoc[]> {
    return AgentRun.find({ userId }).sort({ createdAt: -1 }).lean();
  },

  async listAdminRuns(page: number, limit: number): Promise<{ items: AgentRunDoc[]; page: number; limit: number; total: number }> {
    const total = await AgentRun.countDocuments();
    const items = await AgentRun.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return { items, page, limit, total };
  },

  async listNonTerminalRuns(): Promise<AgentRunDoc[]> {
    return AgentRun.find({ status: 'running' }).sort({ createdAt: 1 }).lean();
  },

  async markStaleRuns(olderThan: Date): Promise<void> {
    await AgentRun.updateMany(
      { status: 'running', leaseUntil: { $lt: olderThan } },
      { $set: { status: 'error', finishedAt: new Date() } },
    );
  },

  async addSpendToRun(runId: string, inputTokens: number, outputTokens: number): Promise<void> {
    await AgentRun.updateOne({ _id: runId }, { $inc: { inputTokens, outputTokens } });
  },

  async addMessage(
    runId: string,
    role: 'system' | 'user' | 'assistant' | 'tool',
    content: string,
    extra?: { toolCallId?: string; name?: string },
  ): Promise<void> {
    await AgentMessage.create({
      runId,
      role,
      content,
      toolCallId: extra?.toolCallId,
      name: extra?.name,
      expiresAt: new Date(Date.now() + TTL_MS),
    });
  },

  async listMessages(runId: string): Promise<AgentMessageDoc[]> {
    return AgentMessage.find({ runId }).sort({ createdAt: 1 }).lean();
  },

  async createToolCall(input: {
    runId: string;
    tool: string;
    args: unknown;
    outcome: AgentToolOutcome;
    latencyMs: number;
    result?: unknown;
    stagedVersion?: number;
    executedVersion?: number;
    preImage?: unknown;
    approval?: { status: AgentApprovalStatus; summary: string; expiresAt: Date };
  }): Promise<AgentToolCallDoc> {
    return AgentToolCall.create({
      runId: input.runId,
      tool: input.tool,
      args: input.args,
      outcome: input.outcome,
      latencyMs: input.latencyMs,
      result: input.result,
      stagedVersion: input.stagedVersion,
      executedVersion: input.executedVersion,
      preImage: input.preImage,
      approval: input.approval,
      expiresAt: new Date(Date.now() + TTL_MS),
    });
  },

  async findToolCallById(id: string): Promise<AgentToolCallDoc | null> {
    return AgentToolCall.findById(id).lean();
  },

  async resolveToolCallApproval(
    id: string,
    decision: { status: 'approved' | 'rejected'; decidedBy: string },
  ): Promise<AgentToolCallDoc | null> {
    return AgentToolCall.findOneAndUpdate(
      { _id: id, 'approval.status': 'pending' },
      {
        $set: {
          'approval.status': decision.status,
          'approval.decidedBy': decision.decidedBy,
          'approval.decidedAt': new Date(),
        },
      },
      { new: true },
    ).lean();
  },

  async expireToolCallApproval(id: string): Promise<void> {
    await AgentToolCall.updateOne({ _id: id, 'approval.status': 'pending' }, { $set: { 'approval.status': 'expired' } });
  },

  async setToolCallOutcome(
    id: string,
    outcome: AgentToolOutcome,
    extra?: { executedVersion?: number; result?: unknown; approvalStatus?: AgentApprovalStatus },
  ): Promise<void> {
    const set: Record<string, unknown> = { outcome };
    if (extra?.executedVersion !== undefined) set.executedVersion = extra.executedVersion;
    if (extra?.result !== undefined) set.result = extra.result;
    if (extra?.approvalStatus !== undefined) set['approval.status'] = extra.approvalStatus;
    await AgentToolCall.updateOne({ _id: id }, { $set: set });
  },

  async expireApprovalsForRuns(runIds: string[]): Promise<void> {
    await AgentToolCall.updateMany(
      { runId: { $in: runIds }, 'approval.status': 'pending' },
      { $set: { 'approval.status': 'expired' } },
    );
  },

  async listToolCallsForRun(runId: string): Promise<AgentToolCallDoc[]> {
    return AgentToolCall.find({ runId }).sort({ createdAt: 1 }).lean();
  },

  async chargeSpend(key: string, usd: number): Promise<number> {
    const doc = await AgentSpend.findOneAndUpdate({ key }, { $inc: { spentUsd: usd } }, { upsert: true, new: true }).lean();
    return doc ? doc.spentUsd : usd;
  },

  async getSpend(key: string): Promise<number> {
    const doc = await AgentSpend.findOne({ key }).lean();
    return doc?.spentUsd ?? 0;
  },

  async enqueueOutbox(input: { type: string; payloadRef: string }): Promise<void> {
    await OutboxEvent.updateOne(
      { type: input.type, payloadRef: input.payloadRef },
      { $setOnInsert: { status: 'pending', attempts: 0 } },
      { upsert: true },
    );
  },

  async claimOutboxEvent(now: Date, leaseMs: number): Promise<OutboxEventDoc | null> {
    return OutboxEvent.findOneAndUpdate(
      {
        $or: [{ status: 'pending' }, { status: 'processing', leasedUntil: { $lt: now } }],
      },
      {
        $set: { status: 'processing', claimedAt: now, leasedUntil: new Date(now.getTime() + leaseMs) },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, new: true },
    ).lean();
  },

  async completeOutbox(id: string): Promise<void> {
    await OutboxEvent.updateOne({ _id: id }, { $set: { status: 'done' } });
  },

  async failOutbox(id: string): Promise<void> {
    await OutboxEvent.updateOne({ _id: id }, { $set: { status: 'failed' } });
  },

  async listPendingOutboxEvents(): Promise<OutboxEventDoc[]> {
    const now = new Date();
    return OutboxEvent.find({
      $or: [{ status: 'pending' }, { status: 'processing', leasedUntil: { $lt: now } }],
    })
      .sort({ createdAt: 1 })
      .lean();
  },

  async markOutboxDoneForPayload(type: string, payloadRef: string): Promise<void> {
    await OutboxEvent.updateOne({ type, payloadRef }, { $set: { status: 'done' } });
  },

  async createSuggestion(input: {
    workOrderId: string;
    runId: string;
    summary: string;
    suggestedPriority: WorkOrderPriority;
    flagForDispatcher: boolean;
    applied: boolean;
  }): Promise<TriageSuggestionDoc> {
    return TriageSuggestion.create(input);
  },

  async listSuggestionsForWorkOrder(workOrderId: string): Promise<TriageSuggestionDoc[]> {
    return TriageSuggestion.find({ workOrderId }).sort({ createdAt: -1 }).lean();
  },

  async setSuggestionApplied(id: string): Promise<void> {
    await TriageSuggestion.updateOne({ _id: id }, { $set: { applied: true } });
  },

  async countSuggestionsToday(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return TriageSuggestion.countDocuments({ createdAt: { $gte: start } });
  },

  async getAgentConfig(name = 'triage'): Promise<AgentConfigDoc | null> {
    return AgentConfig.findOne({ name }).lean();
  },

  async upsertAgentConfig(name = 'triage'): Promise<AgentConfigDoc> {
    const doc = await AgentConfig.findOneAndUpdate({ name }, { $setOnInsert: { name } }, { upsert: true, new: true }).lean();
    if (!doc) throw new Error('Failed to upsert agent config');
    return doc;
  },

  async updateAgentConfig(
    name: string,
    patch: Partial<Pick<AgentConfigDoc, 'mode' | 'allowedFields' | 'dailyActionCap' | 'flagThreshold' | 'workingHours'>>,
    updatedBy: string,
  ): Promise<AgentConfigDoc | null> {
    return AgentConfig.findOneAndUpdate({ name }, { $set: { ...patch, updatedBy } }, { new: true }).lean();
  },

  async setAgentEnabled(enabled: boolean, updatedBy: string): Promise<AgentConfigDoc | null> {
    return AgentConfig.findOneAndUpdate({ name: 'triage' }, { $set: { enabled, updatedBy } }, { new: true }).lean();
  },

  async appendConfigAudit(input: { agentName: string; actorId: string; action: string; before: unknown; after: unknown }): Promise<void> {
    await AgentConfigAudit.create(input);
  },
};
