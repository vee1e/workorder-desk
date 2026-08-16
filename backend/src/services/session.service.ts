import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { REFRESH_TOKEN_TTL_SECONDS, type Role, type UserPublic } from '@workorders/shared';
import { refreshSessionRepo } from '../repositories/refresh-session.repo.js';
import { userRepo } from '../repositories/user.repo.js';
import { toUserPublic } from '../models/user.model.js';
import { signAccessToken } from '../utils/tokens.js';
import { notFound } from '../utils/http-error.js';
import type { TokenPair } from '../utils/cookies.js';

export interface AuthResult {
  user: UserPublic;
  tokens: TokenPair;
}

export function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function issueSession(
  userId: string,
  role: Role,
  ip?: string,
  userAgent?: string,
): Promise<AuthResult> {
  const user = await userRepo.findAuthById(userId);
  if (!user) throw notFound();
  const token = randomBytes(32).toString('base64url');
  const session = await refreshSessionRepo.create({
    userId: user._id.toString(),
    familyId: randomUUID(),
    tokenHash: sha256hex(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    ip,
    userAgent,
  });
  const sid = session._id.toString();
  return {
    user: toUserPublic(user),
    tokens: {
      accessToken: signAccessToken({ sub: user._id.toString(), role: user.role, sid }),
      refreshToken: token,
    },
  };
}