import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface AgentConfigAuditDoc {
  _id: ObjectId;
  agentName: string;
  actorId: string;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const agentConfigAuditSchema = new Schema<AgentConfigAuditDoc>(
  {
    agentName: { type: String, required: true },
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const AgentConfigAudit = (models.AgentConfigAudit ?? model('AgentConfigAudit', agentConfigAuditSchema)) as Model<AgentConfigAuditDoc>;