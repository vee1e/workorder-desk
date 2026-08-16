import { randomBytes } from 'node:crypto';
import { REFRESH_TOKEN_TTL_SECONDS } from '@workorders/shared';
import { userRepo } from '../repositories/user.repo.js';
import { refreshSessionRepo } from '../repositories/refresh-session.repo.js';
import { hashPassword, comparePassword, dummyCompare } from '../utils/passwords.js';
import { signAccessToken } from '../utils/tokens.js';
import { authGeneric, emailTaken, refreshReuse, unauthorized, validation } from '../utils/http-error.js';
import { mailerService } from './mailer.service.js';
import { issueSession, sha256hex, type AuthResult } from './session.service.js';
import { toUserPublic } from '../models/user.model.js';

export const authService = {
  async register(input: { email: string; password: string; name: string }): Promise<AuthResult> {
    const existing = await userRepo.findByEmail(input.email);
    if (existing) throw emailTaken();
    const passwordHash = await hashPassword(input.password);
    const user = await userRepo.createUser({
      email: input.email,
      name: input.name,
      passwordHash,
    });
    return issueSession(user._id.toString(), user.role);
  },

  async login(input: { email: string; password: string }, ip?: string, userAgent?: string): Promise<AuthResult> {
    const user = await userRepo.findAuthByEmail(input.email);
    if (!user) {
      await dummyCompare();
      throw authGeneric();
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await dummyCompare();
      throw authGeneric();
    }
    const ok = await comparePassword(input.password, user.passwordHash);
    if (!ok) {
      await userRepo.incrementFailedLogins(user._id.toString(), new Date(Date.now() + 15 * 60 * 1000));
      throw authGeneric();
    }
    if (!user.isActive) throw authGeneric();
    await userRepo.resetFailedLogins(user._id.toString());
    await userRepo.updateLastLogin(user._id.toString());
    return issueSession(user._id.toString(), user.role, ip, userAgent);
  },

  async refresh(refreshToken: string, ip?: string, userAgent?: string): Promise<AuthResult> {
    const session = await refreshSessionRepo.findByTokenHash(sha256hex(refreshToken));
    if (!session) throw unauthorized();
    const user = await userRepo.findAuthById(session.userId.toString());
    if (!user || !user.isActive) throw unauthorized();
    const now = Date.now();
    if (session.expiresAt.getTime() < now || session.revokedAt) throw unauthorized();

    if (session.usedAt) {
      const withinGrace = now - session.usedAt.getTime() <= 10_000;
      if (!withinGrace) {
        await refreshSessionRepo.revokeFamily(session.familyId);
        throw refreshReuse();
      }
    }

    await refreshSessionRepo.markUsed(session._id.toString());
    const token = randomBytes(32).toString('base64url');
    const next = await refreshSessionRepo.create({
      userId: session.userId.toString(),
      familyId: session.familyId,
      tokenHash: sha256hex(token),
      expiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
      ip,
      userAgent,
    });
    return {
      user: toUserPublic(user),
      tokens: {
        accessToken: signAccessToken({
          sub: user._id.toString(),
          role: user.role,
          sid: next._id.toString(),
        }),
        refreshToken: token,
      },
    };
  },

  async logout(userId: string, sessionId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const session = await refreshSessionRepo.findByTokenHash(sha256hex(refreshToken));
      if (session && session.userId.toString() === userId) {
        await refreshSessionRepo.revokeFamily(session.familyId);
        return;
      }
    }
    if (sessionId) {
      await refreshSessionRepo.revokeAllExcept(userId, sessionId);
    }
  },

  async logoutByRefreshToken(refreshToken: string): Promise<void> {
    const session = await refreshSessionRepo.findByTokenHash(sha256hex(refreshToken));
    if (session) {
      await refreshSessionRepo.revokeFamily(session.familyId);
    }
  },

  async logoutAll(userId: string): Promise<void> {
    await refreshSessionRepo.revokeAllForUser(userId);
  },

  async forgotPassword(email: string): Promise<{ ok: true }> {
    const user = await userRepo.findByEmail(email);
    if (user) {
      const token = randomBytes(32).toString('base64url');
      await userRepo.setPasswordReset(user._id.toString(), sha256hex(token), new Date(Date.now() + 60 * 60 * 1000));
      await mailerService.sendPasswordReset(email, token);
    }
    return { ok: true };
  },

  async resetPassword(input: { token: string; password: string }, ip?: string, userAgent?: string): Promise<AuthResult> {
    const user = await userRepo.findByPasswordResetToken(sha256hex(input.token));
    if (!user) {
      throw validation([{ field: 'token', message: 'Invalid or expired token' }]);
    }
    const passwordHash = await hashPassword(input.password);
    await userRepo.updatePasswordHash(user._id.toString(), passwordHash);
    await userRepo.clearPasswordReset(user._id.toString());
    await refreshSessionRepo.revokeAllForUser(user._id.toString());
    return issueSession(user._id.toString(), user.role, ip, userAgent);
  },
};