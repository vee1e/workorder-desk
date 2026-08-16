import type { UserPublic } from '@workorders/shared';
import { userRepo } from '../repositories/user.repo.js';
import { refreshSessionRepo } from '../repositories/refresh-session.repo.js';
import { toUserPublic } from '../models/user.model.js';
import { comparePassword, hashPassword } from '../utils/passwords.js';
import { authGeneric, notFound } from '../utils/http-error.js';
import { issueSession, type AuthResult } from './session.service.js';

export const profileService = {
  async me(id: string): Promise<UserPublic> {
    const user = await userRepo.findById(id);
    if (!user) throw notFound();
    return toUserPublic(user);
  },

  async updateName(id: string, name: string): Promise<UserPublic> {
    const user = await userRepo.updateName(id, name);
    if (!user) throw notFound();
    return toUserPublic(user);
  },

  async changePassword(
    id: string,
    sessionId: string,
    input: { currentPassword: string; newPassword: string },
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const user = await userRepo.findAuthById(id);
    if (!user) throw notFound();
    const ok = await comparePassword(input.currentPassword, user.passwordHash);
    if (!ok) throw authGeneric();

    const passwordHash = await hashPassword(input.newPassword);
    await userRepo.updatePasswordHash(id, passwordHash);
    await refreshSessionRepo.revokeAllForUser(id);
    return issueSession(id, user.role, ip, userAgent);
  },
};