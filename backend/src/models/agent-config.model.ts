import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';
import type { AgentConfig as AgentConfigDTO, TriageMode, WorkOrderPriority } from '@workorders/shared';

const { Schema, model, models } = mongoose;

export interface AgentConfigDoc {
  _id: ObjectId;
  name: string;
  enabled: boolean;
  mode: TriageMode;
  allowedFields: string[];
  dailyActionCap: number;
  flagThreshold: WorkOrderPriority;
  workingHours: string;
  updatedBy: string | null;
  updatedAt: Date;
}

const agentConfigSchema = new Schema<AgentConfigDoc>(
  {
    name: { type: String, required: true, unique: true, default: 'triage' },
    enabled: { type: Boolean, default: true },
    mode: { type: String, enum: ['suggest', 'auto-apply'], default: 'suggest' },
    allowedFields: { type: [String], default: ['priority'] },
    dailyActionCap: { type: Number, default: 50 },
    flagThreshold: { type: String, enum: ['low', 'medium', 'high'], default: 'high' },
    workingHours: { type: String, default: '*' },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

export const AgentConfig = (models.AgentConfig ?? model('AgentConfig', agentConfigSchema)) as Model<AgentConfigDoc>;

export function toAgentConfigPublic(config: AgentConfigDoc): AgentConfigDTO {
  return {
    name: config.name,
    enabled: config.enabled,
    mode: config.mode,
    allowedFields: config.allowedFields,
    dailyActionCap: config.dailyActionCap,
    flagThreshold: config.flagThreshold,
    workingHours: config.workingHours,
    updatedBy: config.updatedBy,
    updatedAt: config.updatedAt.toISOString(),
  };
}