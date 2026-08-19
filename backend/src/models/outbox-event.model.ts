import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';

const { Schema, model, models } = mongoose;

export type OutboxEventStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface OutboxEventDoc {
  _id: ObjectId;
  type: string;
  payloadRef: string;
  status: OutboxEventStatus;
  claimedAt: Date | null;
  leasedUntil: Date | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const outboxEventSchema = new Schema<OutboxEventDoc>(
  {
    type: { type: String, required: true },
    payloadRef: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' },
    claimedAt: { type: Date, default: null },
    leasedUntil: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

outboxEventSchema.index({ type: 1, payloadRef: 1 }, { unique: true });
outboxEventSchema.index({ status: 1, leasedUntil: 1 });

export const OutboxEvent = (models.OutboxEvent ?? model('OutboxEvent', outboxEventSchema)) as Model<OutboxEventDoc>;