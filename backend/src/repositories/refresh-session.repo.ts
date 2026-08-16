import { RefreshSession, type RefreshSessionDoc } from '../models/refresh-session.model.js';

export interface NewRefreshSession {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
}

export const refreshSessionRepo = {
  async create(input: NewRefreshSession): Promise<RefreshSessionDoc> {
    return RefreshSession.create({
      userId: input.userId,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent,
      ip: input.ip,
    });
  },

  async findByTokenHash(tokenHash: string): Promise<RefreshSessionDoc | null> {
    return RefreshSession.findOne({ tokenHash }).lean();
  },

  async markUsed(id: string): Promise<void> {
    await RefreshSession.updateOne({ _id: id }, { $set: { usedAt: new Date() } });
  },

  async revokeFamily(familyId: string): Promise<void> {
    await RefreshSession.updateMany({ familyId }, { $set: { revokedAt: new Date() } });
  },

  async revokeAllForUser(userId: string): Promise<void> {
    await RefreshSession.updateMany({ userId }, { $set: { revokedAt: new Date() } });
  },

  async revokeAllExcept(userId: string, sessionId: string): Promise<void> {
    await RefreshSession.updateMany(
      { userId, _id: { $ne: sessionId }, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  },

  async revokeForUsers(userIds: string[]): Promise<void> {
    await RefreshSession.updateMany({ userId: { $in: userIds } }, { $set: { revokedAt: new Date() } });
  },
};