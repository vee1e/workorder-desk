import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE } from '@workorders/shared';
import { verifyAccessToken } from '../utils/tokens.js';
import { userRepo } from '../repositories/user.repo.js';
import { forbidden, unauthorized } from '../utils/http-error.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.signedCookies?.[ACCESS_COOKIE];
    if (typeof raw !== 'string' || !raw) throw unauthorized();
    let claims;
    try {
      claims = verifyAccessToken(raw);
    } catch {
      throw unauthorized();
    }
    const user = await userRepo.findById(claims.sub);
    if (!user || !user.isActive) throw unauthorized();
    req.actor = { id: user._id.toString(), role: user.role };
    req.sessionId = claims.sid;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor) return next(unauthorized());
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.actor?.role !== 'admin') return next(forbidden());
  next();
}

export function requireAdminOrViewer(req: Request, _res: Response, next: NextFunction): void {
  if (req.actor?.role !== 'admin' && req.actor?.role !== 'viewer') return next(forbidden());
  next();
}

export function requireWritableUser(req: Request, _res: Response, next: NextFunction): void {
  if (req.actor?.role === 'viewer') return next(forbidden('Viewer accounts are read-only'));
  next();
}