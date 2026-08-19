import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';
import type { AgentApproval, AgentApprovalStatus, AgentToolCall as AgentToolCallDTO, AgentToolOutcome } from '@workorders/shared';

const { Schema, model, models } = mongoose;

const approvalSchema = new Schema<AgentToolCallApprovalDoc>({
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired', 'stale'], default: 'pending' },
  summary: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  decidedBy: { type: String },
  decidedAt: { type: Date },
});

export interface AgentToolCallApprovalDoc {
  status: AgentApprovalStatus;
  summary: string;
  expiresAt: Date;
  decidedBy?: string;
  decidedAt?: Date;
}

export interface AgentToolCallDoc {
  _id: ObjectId;
  runId: ObjectId;
  tool: string;
  args: unknown;
  result?: unknown;
  outcome: AgentToolOutcome;
  latencyMs: number;
  stagedVersion?: number;
  executedVersion?: number;
  preImage?: unknown;
  approval?: AgentToolCallApprovalDoc;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const agentToolCallSchema = new Schema<AgentToolCallDoc>(
  {
    runId: { type: Schema.ObjectId, ref: 'AgentRun', required: true, index: true },
    tool: { type: String, required: true },
    args: { type: Schema.Types.Mixed, required: true },
    result: { type: Schema.Types.Mixed },
    outcome: {
      type: String,
      enum: ['executed', 'approved', 'rejected', 'expired', 'stale', 'error', 'blocked', 'aborted'],
      required: true,
    },
    latencyMs: { type: Number, default: 0 },
    stagedVersion: { type: Number },
    executedVersion: { type: Number },
    preImage: { type: Schema.Types.Mixed },
    approval: { type: approvalSchema, default: undefined },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

agentToolCallSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AgentToolCall = (models.AgentToolCall ?? model('AgentToolCall', agentToolCallSchema)) as Model<AgentToolCallDoc>;

export function toAgentToolCallPublic(call: AgentToolCallDoc): AgentToolCallDTO {
  return {
    id: call._id.toString(),
    runId: call.runId.toString(),
    tool: call.tool,
    args: call.args,
    outcome: call.outcome,
    latencyMs: call.latencyMs,
    createdAt: call.createdAt.toISOString(),
    ...(call.result !== undefined ? { result: call.result } : {}),
    ...(call.stagedVersion !== undefined ? { stagedVersion: call.stagedVersion } : {}),
    ...(call.executedVersion !== undefined ? { executedVersion: call.executedVersion } : {}),
    ...(call.preImage !== undefined ? { preImage: call.preImage } : {}),
    ...(call.approval
      ? {
          approval: {
            status: call.approval.status,
            summary: call.approval.summary,
            expiresAt: call.approval.expiresAt.toISOString(),
            ...(call.approval.decidedBy !== undefined ? { decidedBy: call.approval.decidedBy } : {}),
            ...(call.approval.decidedAt !== undefined ? { decidedAt: call.approval.decidedAt.toISOString() } : {}),
          } satisfies AgentApproval,
        }
      : {}),
  };
}