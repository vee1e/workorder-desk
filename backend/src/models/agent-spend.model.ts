import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface AgentSpendDoc {
  _id: ObjectId;
  key: string;
  spentUsd: number;
  createdAt: Date;
  updatedAt: Date;
}

const agentSpendSchema = new Schema<AgentSpendDoc>(
  {
    key: { type: String, required: true, unique: true },
    spentUsd: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const AgentSpend = (models.AgentSpend ?? model('AgentSpend', agentSpendSchema)) as Model<AgentSpendDoc>;