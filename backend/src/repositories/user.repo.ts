import type { Role } from '@workorders/shared';
import { User, type UserDoc } from '../models/user.model.js';
import { escapeRegex } from '../utils/regex.js';

export class DuplicateEmailError extends Error {
  constructor() {
    super('Duplicate email');
    this.name = 'DuplicateEmailError';
  }
}

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export const userRepo = {
  async findByEmail(email: string): Promise<UserDoc | null> {
    return User.findOne({ email }).lean();
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

  // Counts failures within a rolling 15-minute window only. Locks once the
  // threshold is reached inside the window and never re-arms from a stale count.
  async incrementFailedLogins(id: string): Promise<void> {
    const now = new Date();
    const windowFloor = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    const inWindow = {
      $and: [{ $ne: ['$failedLoginWindowStartAt', null] }, { $gte: ['$failedLoginWindowStartAt', windowFloor] }],
    };
    await User.updateOne(
      { _id: id },
      [
        {
          $set: {
            failedLoginWindowStartAt: { $cond: [inWindow, '$failedLoginWindowStartAt', now] },
            failedLoginCount: {
              $cond: [inWindow, { $add: [{ $ifNull: ['$failedLoginCount', 0] }, 1] }, 1],
            },
            lockedUntil: {
              $cond: [
                {
                  $and: [
                    { $gte: [{ $add: [{ $ifNull: ['$failedLoginCount', 0] }, 1] }, LOCKOUT_THRESHOLD] },
                    { $eq: ['$lockedUntil', null] },
                  ],
                },
                new Date(Date.now() + LOCKOUT_WINDOW_MS),
                '$lockedUntil',
              ],
            },
          },
        },
      ],
    );
  },

  async resetFailedLogins(id: string): Promise<void> {
    await User.updateOne(
      { _id: id },
      { $set: { failedLoginCount: 0, failedLoginWindowStartAt: null, lockedUntil: null } },
    );
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

  async updateAiEnabled(id: string, aiEnabled: boolean): Promise<UserDoc | null> {
    return User.findByIdAndUpdate(id, { $set: { aiEnabled } }, { new: true }).lean();
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
};