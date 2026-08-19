import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { toAgentConfigPublic, type AgentConfigDoc } from '../src/models/agent-config.model.js';
import { toTriageSuggestionPublic, type TriageSuggestionDoc } from '../src/models/triage-suggestion.model.js';
import { toAgentRunPublic, type AgentRunDoc } from '../src/models/agent-run.model.js';

describe('model mappers', () => {
  it('toAgentConfigPublic maps a config document to the public DTO', () => {
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      name: 'triage',
      enabled: true,
      mode: 'auto-apply',
      allowedFields: ['priority'],
      dailyActionCap: 12,
      flagThreshold: 'medium',
      workingHours: '09-17',
      updatedBy: 'admin-1',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as unknown as AgentConfigDoc;

    expect(toAgentConfigPublic(doc)).toEqual({
      name: 'triage',
      enabled: true,
      mode: 'auto-apply',
      allowedFields: ['priority'],
      dailyActionCap: 12,
      flagThreshold: 'medium',
      workingHours: '09-17',
      updatedBy: 'admin-1',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('toTriageSuggestionPublic maps a suggestion document to the public DTO', () => {
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      workOrderId: new mongoose.Types.ObjectId(),
      runId: new mongoose.Types.ObjectId(),
      summary: 'Needs dispatch',
      suggestedPriority: 'high',
      flagForDispatcher: true,
      applied: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T01:00:00Z'),
    } as unknown as TriageSuggestionDoc;

    expect(toTriageSuggestionPublic(doc)).toEqual({
      id: doc._id.toString(),
      workOrderId: doc.workOrderId.toString(),
      runId: doc.runId.toString(),
      summary: 'Needs dispatch',
      suggestedPriority: 'high',
      flagForDispatcher: true,
      applied: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('toAgentRunPublic maps a run with all optional fields set', () => {
    const userId = new mongoose.Types.ObjectId();
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      sessionId: null,
      userId,
      mode: 'autonomous',
      agentName: 'triage',
      status: 'complete',
      model: 'gpt-4o-mini',
      inputTokens: 100,
      outputTokens: 20,
      errorCode: 'AI_UNAVAILABLE',
      finishedAt: new Date('2026-01-01T02:00:00Z'),
      leaseUntil: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T02:00:00Z'),
    } as unknown as AgentRunDoc;

    expect(toAgentRunPublic(doc)).toEqual({
      id: doc._id.toString(),
      mode: 'autonomous',
      actorId: userId.toString(),
      agentName: 'triage',
      status: 'complete',
      model: 'gpt-4o-mini',
      inputTokens: 100,
      outputTokens: 20,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T02:00:00.000Z',
      errorCode: 'AI_UNAVAILABLE',
    });
  });

  it('toAgentRunPublic maps a run with no optional fields set', () => {
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      sessionId: null,
      userId: null,
      mode: 'copilot',
      status: 'running',
      model: 'gpt-4o-mini',
      inputTokens: 0,
      outputTokens: 0,
      finishedAt: null,
      leaseUntil: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as unknown as AgentRunDoc;

    expect(toAgentRunPublic(doc)).toEqual({
      id: doc._id.toString(),
      mode: 'copilot',
      actorId: null,
      status: 'running',
      model: 'gpt-4o-mini',
      inputTokens: 0,
      outputTokens: 0,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });
});
