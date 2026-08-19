import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';
import type { CopilotSession as CopilotSessionDTO, CopilotSessionStatus } from '@workorders/shared';

const { Schema, model, models } = mongoose;

export interface CopilotSessionDoc {
  _id: ObjectId;
  userId: ObjectId;
  status: CopilotSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const copilotSessionSchema = new Schema<CopilotSessionDoc>(
  {
    userId: { type: Schema.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'archived', 'expired'], default: 'active' },
  },
  { timestamps: true },
);

copilotSessionSchema.index({ userId: 1, status: 1 });

export const CopilotSession = (models.CopilotSession ?? model('CopilotSession', copilotSessionSchema)) as Model<CopilotSessionDoc>;

export function toCopilotSessionPublic(session: CopilotSessionDoc): CopilotSessionDTO {
  return {
    id: session._id.toString(),
    userId: session.userId.toString(),
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}