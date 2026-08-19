import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';
import type { AgentRun as AgentRunDTO, AgentRunMode, AgentRunStatus, ErrorCode } from '@workorders/shared';

const { Schema, model, models } = mongoose;

export interface AgentRunDoc {
  _id: ObjectId;
  sessionId: ObjectId | null;
  userId: ObjectId | null;
  mode: AgentRunMode;
  agentName?: string;
  status: AgentRunStatus;
  model: string;
  inputTokens: number;
  outputTokens: number;
  errorCode?: string;
  finishedAt: Date | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const agentRunSchema = new Schema<AgentRunDoc>(
  {
    sessionId: { type: Schema.ObjectId, ref: 'CopilotSession', default: null },
    userId: { type: Schema.ObjectId, ref: 'User', default: null },
    mode: { type: String, enum: ['copilot', 'autonomous'], required: true },
    agentName: { type: String },
    status: {
      type: String,
      enum: ['running', 'complete', 'error', 'budget_exceeded', 'expired', 'aborted'],
      default: 'running',
    },
    model: { type: String, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    errorCode: { type: String },
    finishedAt: { type: Date, default: null },
    leaseUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

agentRunSchema.index({ userId: 1, status: 1 });
agentRunSchema.index({ sessionId: 1 });
agentRunSchema.index({ status: 1, leaseUntil: 1 });

export const AgentRun = (models.AgentRun ?? model('AgentRun', agentRunSchema)) as Model<AgentRunDoc>;

export function toAgentRunPublic(run: AgentRunDoc): AgentRunDTO {
  return {
    id: run._id.toString(),
    mode: run.mode,
    actorId: run.userId ? run.userId.toString() : null,
    ...(run.agentName ? { agentName: run.agentName } : {}),
    status: run.status,
    model: run.model,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    startedAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    ...(run.errorCode ? { errorCode: run.errorCode as ErrorCode } : {}),
  };
}