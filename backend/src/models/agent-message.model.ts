import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';

const { Schema, model, models } = mongoose;

export type AgentMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AgentMessageDoc {
  _id: ObjectId;
  runId: ObjectId;
  role: AgentMessageRole;
  content: string;
  toolCallId?: string;
  name?: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const agentMessageSchema = new Schema<AgentMessageDoc>(
  {
    runId: { type: Schema.ObjectId, ref: 'AgentRun', required: true, index: true },
    role: { type: String, enum: ['system', 'user', 'assistant', 'tool'], required: true },
    content: { type: String, required: true },
    toolCallId: { type: String },
    name: { type: String },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

agentMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AgentMessage = (models.AgentMessage ?? model('AgentMessage', agentMessageSchema)) as Model<AgentMessageDoc>;