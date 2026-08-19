import { randomUUID } from 'node:crypto';
import type { AgentRun, AgentRunStatus, AgentToolCall, CopilotSession, SseEvent, WorkOrderPublic } from '@workorders/shared';
import { env } from '../config/env.js';
import { agentRepo } from '../repositories/agent.repo.js';
import { userRepo } from '../repositories/user.repo.js';
import { toAgentRunPublic } from '../models/agent-run.model.js';
import { toAgentToolCallPublic } from '../models/agent-tool-call.model.js';
import { toCopilotSessionPublic } from '../models/copilot-session.model.js';
import type { ProviderMessage, ProviderResult, ProviderTool } from './provider.js';
import { copilotTools, toolByName } from './tools.js';
import { assertAIEnabled, assertBudget, billSpend, compactWorkOrder, serializeResult, SYSTEM_PROMPT } from './policy.js';
import { workOrderService } from '../services/work-order.service.js';
import { forbidden, HttpError, notFound } from '../utils/http-error.js';
import type { Actor } from '../utils/actor.js';
import { toJsonSchema } from './zod-json.js';

export interface PendingDecision {
  toolCallId: string;
  expiresAt: number;
}

interface PendingEntry {
  resolve: (decision: 'approved' | 'rejected') => void;
  args: unknown;
  targetId?: string;
}

const pendingApprovals = new Map<string, PendingEntry>();
const activeAborts = new Map<string, AbortController>();
const activeRuns = new Map<string, string>();

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

async function assertUserEnabled(userId: string): Promise<void> {
  const user = await userRepo.findById(userId);
  if (!user || !user.aiEnabled) throw forbidden('AI is disabled for this account');
}

const providerTools: ProviderTool[] = copilotTools.map((tool) => ({
  type: 'function',
  function: { name: tool.name, description: tool.description, parameters: toJsonSchema(tool.inputSchema) },
}));

function isWorkOrder(value: unknown): value is WorkOrderPublic {
  return value !== null && typeof value === 'object' && 'id' in value && 'version' in value;
}

export const copilotRuntime = {
  async createSession(actor: Actor): Promise<CopilotSession> {
    assertAIEnabled();
    await assertUserEnabled(actor.id);
    const sessions = await agentRepo.listSessionsForUser(actor.id);
    const active = sessions.filter((session) => session.status === 'active');
    for (const session of active) {
      if (await agentRepo.hasNonTerminalRun(session._id.toString())) {
        throw new HttpError(409, 'AI_APPROVAL_PENDING', 'Complete the current request first');
      }
    }
    for (const session of active) await agentRepo.archiveSession(session._id.toString());
    const created = await agentRepo.createSession(actor.id);
    return toCopilotSessionPublic(created);
  },

  async listSessions(actor: Actor): Promise<CopilotSession[]> {
    const sessions = await agentRepo.listSessionsForUser(actor.id);
    return sessions.map(toCopilotSessionPublic);
  },

  async runTurn(input: {
    sessionId: string;
    actor: Actor;
    content: string;
    signal?: AbortSignal;
    onEvent: (event: SseEvent) => void;
  }): Promise<AgentRun> {
    const { sessionId, actor, content, onEvent } = input;
    assertAIEnabled();
    await assertUserEnabled(actor.id);

    const session = await agentRepo.findSessionById(sessionId);
    if (!session || session.userId.toString() !== actor.id) throw notFound('Copilot session not found');
    if (session.status !== 'active') throw forbidden('Copilot session is not active');
    if (await agentRepo.hasNonTerminalRun(sessionId)) {
      throw new HttpError(409, 'AI_APPROVAL_PENDING', 'Complete the current request first');
    }

    const { chatStream, providerModel } = await import('./provider.js');
    const run = await agentRepo.createRun({ sessionId, userId: actor.id, mode: 'copilot', model: providerModel });
    const runId = run._id.toString();
    await agentRepo.addMessage(runId, 'user', content);

    const transcript: ProviderMessage[] = [{ role: 'user', content }];
    const seen = new Map<string, { version: number; workOrder: WorkOrderPublic }>();
    const readCache = new Map<string, { args: unknown; result: unknown }>();

    const ctrl = new AbortController();
    if (input.signal) {
      if (input.signal.aborted) ctrl.abort();
      else input.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
    activeAborts.set(sessionId, ctrl);
    activeRuns.set(sessionId, runId);

    let finished = false;
    const finishAndReturn = async (
      status: AgentRunStatus,
      extra?: { errorCode?: string; inputTokens?: number; outputTokens?: number },
    ): Promise<AgentRun> => {
      finished = true;
      await agentRepo.finishRun(runId, { status, finishedAt: new Date(), ...extra });
      const doc = await agentRepo.findRunById(runId);
      return toAgentRunPublic(doc!);
    };

    const pushToolMessage = async (providerCallId: string, name: string, text: string): Promise<void> => {
      await agentRepo.addMessage(runId, 'tool', text, { toolCallId: providerCallId, name });
      transcript.push({ role: 'tool', content: text, tool_call_id: providerCallId, name });
    };

    const ingestList = (value: unknown): void => {
      if (!Array.isArray(value)) return;
      for (const item of value) {
        if (isWorkOrder(item)) seen.set(item.id, { version: item.version, workOrder: item });
      }
    };

    try {
      for (let step = 1; step <= env.AI_MAX_STEPS_PER_RUN; step++) {
        assertAIEnabled();
        await assertBudget(actor.id);
        if (ctrl.signal.aborted) return finishAndReturn('aborted');

        let result: ProviderResult;
        try {
          result = await chatStream([{ role: 'system', content: SYSTEM_PROMPT }, ...transcript], providerTools, {
            maxTokens: env.AI_MAX_OUTPUT_TOKENS,
            onToken: (delta) => onEvent({ event: 'token', content: delta }),
            signal: ctrl.signal,
          });
        } catch (err) {
          if (isAbortError(err)) return finishAndReturn('aborted');
          await agentRepo.finishRun(runId, { status: 'error', finishedAt: new Date(), errorCode: 'AI_UNAVAILABLE' });
          finished = true;
          throw new HttpError(503, 'AI_UNAVAILABLE', 'AI provider unavailable');
        }

        await billSpend(actor.id, result.inputTokens, result.outputTokens);
        await agentRepo.addSpendToRun(runId, result.inputTokens, result.outputTokens);
        await agentRepo.addMessage(runId, 'assistant', result.content);
        transcript.push({
          role: 'assistant',
          content: result.content,
          ...(result.tool_calls.length ? { tool_calls: result.tool_calls } : {}),
        });

        if (result.tool_calls.length === 0) {
          const runDto = await finishAndReturn('complete', {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          });
          onEvent({
            event: 'message_done',
            runId,
            content: result.content,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          });
          return runDto;
        }

        for (const tc of result.tool_calls) {
          const providerCallId = tc.id || randomUUID();

          let parsedArgs: unknown;
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch {
            await failToolCall(runId, tc.function.name, tc.function.arguments, 'Malformed arguments', providerCallId, onEvent, pushToolMessage);
            continue;
          }

          const tool = toolByName(tc.function.name);
          if (!tool) {
            await failToolCall(runId, tc.function.name, parsedArgs, 'Unknown tool', providerCallId, onEvent, pushToolMessage);
            continue;
          }

          const validation = tool.inputSchema.safeParse(parsedArgs);
          if (!validation.success) {
            const message = validation.error.issues[0] ? validation.error.issues[0].message : 'Invalid arguments';
            await failToolCall(runId, tc.function.name, parsedArgs, message, providerCallId, onEvent, pushToolMessage);
            continue;
          }
          const args = validation.data;

          if (!tool.roles.includes(actor.role)) {
            const message = 'Blocked: this tool is not permitted for your role';
            await agentRepo.createToolCall({ runId, tool: tool.name, args, outcome: 'blocked', latencyMs: 0, result: message });
            await pushToolMessage(providerCallId, tool.name, message);
            onEvent({ event: 'tool_result', toolCallId: providerCallId, outcome: 'blocked', result: message });
            continue;
          }

          if (tool.mode === 'read') {
            const cacheKey = `${tool.name}:${JSON.stringify(args)}`;
            if (readCache.has(cacheKey)) {
              const cached = readCache.get(cacheKey)!;
              const cachedText = serializeResult(cached.result);
              await pushToolMessage(providerCallId, tool.name, cachedText);
              onEvent({ event: 'tool_result', toolCallId: providerCallId, outcome: 'executed', result: cachedText });
              continue;
            }
            const start = Date.now();
            const raw = await tool.handler(actor, args);
            const latencyMs = Date.now() - start;
            ingestList(raw);
            const text = serializeResult(raw);
            readCache.set(cacheKey, { args, result: raw });
            await agentRepo.createToolCall({ runId, tool: tool.name, args, outcome: 'executed', latencyMs, result: text });
            await pushToolMessage(providerCallId, tool.name, text);
            onEvent({ event: 'tool_result', toolCallId: providerCallId, outcome: 'executed', result: text });
            continue;
          }

          // ── Write tools (staged for approval) ──────────────────────────────
          const isTargeted = tool.name === 'update_work_order' || tool.name === 'delete_work_order';
          const targetId = isTargeted ? (args as { id: string }).id : undefined;
          if (isTargeted) {
            const current = seen.get(targetId!);
            if (!current) {
              const message = 'Work order id not seen in this run';
              await agentRepo.createToolCall({ runId, tool: tool.name, args, outcome: 'blocked', latencyMs: 0, result: message });
              await pushToolMessage(providerCallId, tool.name, message);
              onEvent({ event: 'tool_result', toolCallId: providerCallId, outcome: 'blocked', result: message });
              continue;
            }
          }

          const version = isTargeted ? seen.get(targetId!)?.version : undefined;
          if (isTargeted && version === undefined) {
            const message = 'Work order id not seen in this run';
            await agentRepo.createToolCall({ runId, tool: tool.name, args, outcome: 'blocked', latencyMs: 0, result: message });
            await pushToolMessage(providerCallId, tool.name, message);
            onEvent({ event: 'tool_result', toolCallId: providerCallId, outcome: 'blocked', result: message });
            continue;
          }

          // Version is injected by the runtime; the model never supplies it.
          const stagedArgs = isTargeted ? { ...(args as Record<string, unknown>), version } : args;
          const preImage = isTargeted ? seen.get(targetId!)?.workOrder ?? null : null;
          const afterDiff = isTargeted
            ? {
                title: (stagedArgs as Record<string, unknown>).title,
                description: (stagedArgs as Record<string, unknown>).description,
                priority: (stagedArgs as Record<string, unknown>).priority,
                status: (stagedArgs as Record<string, unknown>).status,
              }
            : stagedArgs;
          const summary = tool.name === 'create_work_order' ? 'Create work order' : `Update work order ${targetId}`;

          const expiresAt = new Date(Date.now() + env.AI_APPROVAL_TTL_MS);
          const toolCall = await agentRepo.createToolCall({
            runId,
            tool: tool.name,
            args: stagedArgs,
            outcome: 'approved',
            latencyMs: 0,
            stagedVersion: version,
            preImage,
            approval: { status: 'pending', summary, expiresAt },
          });
          const toolCallId = toolCall._id.toString();

          onEvent({
            event: 'tool_approval_required',
            toolCallId,
            tool: tool.name,
            args: stagedArgs,
            preImage,
            afterDiff,
            summary,
            expiresAt: expiresAt.toISOString(),
          });

          let resolveDecision: ((decision: 'approved' | 'rejected') => void) | undefined;
          const decisionPromise = new Promise<'approved' | 'rejected'>((resolve) => {
            resolveDecision = resolve;
          });
          pendingApprovals.set(toolCallId, { resolve: resolveDecision!, args: stagedArgs, ...(targetId ? { targetId } : {}) });

          let timer: NodeJS.Timeout | undefined;
          const timeoutPromise = new Promise<'expired'>((resolve) => {
            timer = setTimeout(() => resolve('expired'), Math.max(0, expiresAt.getTime() - Date.now()));
            timer.unref();
          });

          let resolveAbort: ((decision: 'aborted') => void) | undefined;
          const onAbort = (): void => resolveAbort?.('aborted');
          const abortPromise = new Promise<'aborted'>((resolve) => {
            resolveAbort = resolve;
            if (ctrl.signal.aborted) return resolve('aborted');
            ctrl.signal.addEventListener('abort', onAbort, { once: true });
          });

          const decision = await Promise.race([decisionPromise, timeoutPromise, abortPromise]);
          pendingApprovals.delete(toolCallId);
          if (timer) clearTimeout(timer);
          ctrl.signal.removeEventListener('abort', onAbort);

          if (decision === 'expired') {
            await agentRepo.expireToolCallApproval(toolCallId);
            onEvent({ event: 'tool_approval_expired', toolCallId });
            return finishAndReturn('expired');
          }
          if (decision === 'aborted') return finishAndReturn('aborted');

          if (decision === 'rejected') {
            await agentRepo.setToolCallOutcome(toolCallId, 'rejected');
            const message = 'User rejected this action';
            await pushToolMessage(providerCallId, tool.name, message);
            onEvent({ event: 'tool_result', toolCallId, outcome: 'rejected', result: message });
            continue;
          }

          // approved
          if (isTargeted) {
            const fresh = await workOrderService.get(actor, targetId!);
            if (fresh.version !== version) {
              await agentRepo.setToolCallOutcome(toolCallId, 'stale', { approvalStatus: 'stale' });
              const message = 'Stale approval: the work order changed; propose the update again with the current version';
              await pushToolMessage(providerCallId, tool.name, message);
              onEvent({ event: 'tool_result', toolCallId, outcome: 'stale', result: message });
              continue;
            }
          }

          if (ctrl.signal.aborted) return finishAndReturn('aborted');

          let raw: unknown;
          try {
            raw = await tool.handler(actor, stagedArgs);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Tool execution failed';
            await agentRepo.setToolCallOutcome(toolCallId, 'error', { result: message });
            await pushToolMessage(providerCallId, tool.name, message);
            onEvent({ event: 'tool_result', toolCallId, outcome: 'error', result: message });
            continue;
          }

          const compact = isWorkOrder(raw)
            ? compactWorkOrder(raw)
            : serializeResult(raw === undefined ? { ok: true, id: targetId ?? null } : raw);
          if (isWorkOrder(raw)) seen.set(raw.id, { version: raw.version, workOrder: raw });
          const resultText = typeof compact === 'string' ? compact : serializeResult(compact);
          await agentRepo.setToolCallOutcome(toolCallId, 'executed', {
            ...(version !== undefined ? { executedVersion: version } : {}),
            result: compact,
          });
          await pushToolMessage(providerCallId, tool.name, resultText);
          onEvent({ event: 'tool_result', toolCallId, outcome: 'executed', result: compact });
        }
      }

      return finishAndReturn('budget_exceeded');
    } catch (err) {
      if (!finished) {
        await agentRepo.finishRun(runId, {
          status: 'error',
          finishedAt: new Date(),
          errorCode: err instanceof HttpError ? err.code : 'INTERNAL',
        });
      }
      throw err;
    } finally {
      activeAborts.delete(sessionId);
      activeRuns.delete(sessionId);
    }
  },

  async decide(toolCallId: string, actor: Actor, approve: boolean): Promise<AgentToolCall> {
    const tc = await agentRepo.findToolCallById(toolCallId);
    if (!tc) throw notFound('Tool call not found');
    const run = await agentRepo.findRunById(tc.runId.toString());
    if (!run) throw notFound('Run not found');
    if (run.userId?.toString() !== actor.id) throw forbidden();
    if (tc.approval?.status !== 'pending') throw new HttpError(409, 'AI_APPROVAL_RESOLVED', 'Already decided');
    if (!tc.approval || new Date(tc.approval.expiresAt).getTime() < Date.now()) {
      throw new HttpError(409, 'AI_APPROVAL_EXPIRED', 'Approval expired');
    }
    if (run.status !== 'running') throw new HttpError(409, 'AI_APPROVAL_EXPIRED', 'Run is no longer active');

    const resolved = await agentRepo.resolveToolCallApproval(toolCallId, {
      status: approve ? 'approved' : 'rejected',
      decidedBy: actor.id,
    });
    if (!resolved) throw new HttpError(409, 'AI_APPROVAL_RESOLVED', 'Already decided');

    const entry = pendingApprovals.get(toolCallId);
    if (entry) {
      entry.resolve(approve ? 'approved' : 'rejected');
    } else if (approve) {
      throw new HttpError(409, 'AI_APPROVAL_RESOLVED', 'Run no longer active');
    }
    return toAgentToolCallPublic(resolved);
  },

  async abortSession(sessionId: string): Promise<void> {
    activeAborts.get(sessionId)?.abort();
    const runId = activeRuns.get(sessionId);
    if (!runId) return;
    const run = await agentRepo.findRunById(runId);
    if (!run || run.status !== 'running') return;
    const toolCalls = await agentRepo.listToolCallsForRun(runId);
    for (const tc of toolCalls) {
      if (tc.approval?.status === 'pending') await agentRepo.expireToolCallApproval(tc._id.toString());
    }
    await agentRepo.finishRun(runId, { status: 'aborted', finishedAt: new Date() });
  },

  async sweepExpiredApprovals(): Promise<void> {
    const now = Date.now();
    for (const [toolCallId] of pendingApprovals) {
      const tc = await agentRepo.findToolCallById(toolCallId);
      if (!tc) {
        pendingApprovals.delete(toolCallId);
        continue;
      }
      const expiresAt = tc.approval?.expiresAt ? new Date(tc.approval.expiresAt).getTime() : 0;
      if (expiresAt > now) continue;
      await agentRepo.expireToolCallApproval(toolCallId);
      const run = await agentRepo.findRunById(tc.runId.toString());
      if (run && run.status === 'running') {
        await agentRepo.finishRun(tc.runId.toString(), { status: 'expired', finishedAt: new Date() });
      }
      pendingApprovals.delete(toolCallId);
    }
  },
};

async function failToolCall(
  runId: string,
  toolName: string,
  args: unknown,
  message: string,
  providerCallId: string,
  onEvent: (event: SseEvent) => void,
  pushToolMessage: (providerCallId: string, name: string, text: string) => Promise<void>,
): Promise<void> {
  await agentRepo.createToolCall({ runId, tool: toolName, args, outcome: 'error', latencyMs: 0, result: message });
  await pushToolMessage(providerCallId, toolName, message);
  onEvent({ event: 'tool_result', toolCallId: providerCallId, outcome: 'error', result: message });
}
