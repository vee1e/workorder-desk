import type { Role } from '@workorders/shared';
import { User, toUserAdmin, type UserDoc } from '../models/user.model.js';

export class DuplicateEmailError extends Error {
  constructor() {
    super('Duplicate email');
    this.name = 'DuplicateEmailError';
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const userRepo = {
  async findByEmail(email: string): Promise<UserDoc | null> {
    return User.findOne({ email }).lean();
  },

  async findAuthByEmail(email: string): Promise<UserDoc | null> {
    return User.findOne({ email }).lean();
  },

  async findAuthById(id: string): Promise<UserDoc | null> {
    return User.findById(id).lean();
  },

  async findById(id: string): Promise<UserDoc | null> {
    return User.findById(id).lean();
  },

  async createUser(input: { email: string; passwordHash: string; name: string; role?: Role }): Promise<UserDoc> {
    try {
      return await User.create({
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
        role: input.role ?? 'user',
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new DuplicateEmailError();
      }
      throw err;
    }
  },

  async updateLastLogin(id: string): Promise<void> {
    await User.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } });
  },

  async incrementFailedLogins(id: string, lockUntil: Date): Promise<void> {
    const user = await User.findByIdAndUpdate(id, { $inc: { failedLoginCount: 1 } }, { new: true }).lean();
    if (user && user.failedLoginCount >= 5 && !user.lockedUntil) {
      await User.updateOne({ _id: id }, { $set: { lockedUntil: lockUntil } });
    }
  },

  async resetFailedLogins(id: string): Promise<void> {
    await User.updateOne({ _id: id }, { $set: { failedLoginCount: 0, lockedUntil: null } });
  },

  async countAdmins(): Promise<number> {
    return User.countDocuments({ role: 'admin' });
  },

  async countAll(): Promise<number> {
    return User.countDocuments();
  },

  async listUsers(input: {
    page: number;
    limit: number;
    search?: string;
    role?: Role;
  }): Promise<{ items: UserDoc[]; page: number; limit: number; total: number }> {
    const filter: Record<string, unknown> = {};
    if (input.search) {
      const regex = new RegExp(escapeRegex(input.search), 'i');
      filter.$or = [{ name: regex }, { email: regex }];
    }
    if (input.role) {
      filter.role = input.role;
    }
    const total = await User.countDocuments(filter);
    const docs = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit)
      .lean();
    return { items: docs, page: input.page, limit: input.limit, total };
  },

  async updateRole(id: string, role: Role): Promise<UserDoc | null> {
    return User.findByIdAndUpdate(id, { $set: { role } }, { new: true }).lean();
  },

  async updateStatus(id: string, isActive: boolean): Promise<UserDoc | null> {
    return User.findByIdAndUpdate(id, { $set: { isActive } }, { new: true }).lean();
  },

  async updateName(id: string, name: string): Promise<UserDoc | null> {
    return User.findByIdAndUpdate(id, { $set: { name } }, { new: true }).lean();
  },

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await User.updateOne({ _id: id }, { $set: { passwordHash } });
  },

  async setPasswordReset(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await User.updateOne({ _id: id }, { $set: { passwordReset: { tokenHash, expiresAt } } });
  },

  async clearPasswordReset(id: string): Promise<void> {
    await User.updateOne({ _id: id }, { $unset: { passwordReset: '' } });
  },

  async findByPasswordResetToken(tokenHash: string): Promise<UserDoc | null> {
    return User.findOne({
      'passwordReset.tokenHash': tokenHash,
      'passwordReset.expiresAt': { $gt: new Date() },
    }).lean();
  },

  toAdmin(doc: UserDoc) {
    return toUserAdmin(doc);
  },
};