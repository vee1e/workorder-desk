import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface RefreshSessionDoc {
  _id: ObjectId;
  userId: ObjectId;
  familyId: string;
  tokenHash: string;
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  userAgent?: string;
  ip?: string;
}

const refreshSessionSchema = new Schema<RefreshSessionDoc>({
  userId: { type: Schema.ObjectId, ref: 'User', required: true, index: true },
  familyId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  usedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  userAgent: { type: String },
  ip: { type: String },
});

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession = (models.RefreshSession ?? model('RefreshSession', refreshSessionSchema)) as Model<RefreshSessionDoc>;