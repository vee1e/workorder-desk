import mongoose from 'mongoose';
import type { Model, ObjectId } from 'mongoose';
import type { Role, UserAdmin, UserPublic } from '@workorders/shared';

const { Schema, model, models } = mongoose;

export interface UserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  passwordReset?: {
    tokenHash?: string;
    expiresAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user', 'viewer'], default: 'user' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    passwordReset: {
      tokenHash: { type: String },
      expiresAt: { type: Date },
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1 });

export const User = (models.User ?? model('User', userSchema)) as Model<UserDoc>;

export function toUserPublic(user: UserDoc): UserPublic {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toUserAdmin(user: UserDoc): UserAdmin {
  return {
    ...toUserPublic(user),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}