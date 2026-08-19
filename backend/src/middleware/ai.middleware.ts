import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { ErrorEnvelope } from '@workorders/shared';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';

function sendRateLimited(requestId: string, res: { status: (code: number) => { json: (body: unknown) => void } }): void {
  const body: ErrorEnvelope = {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' },
    requestId,
  };
  res.status(429).json(body);
}

export function requireAIAvailable(_req: Request, _res: Response, next: NextFunction): void {
  if (!env.AI_ENABLED) return next(new HttpError(503, 'AI_UNAVAILABLE', 'AI is disabled'));
  next();
}

export const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.AI_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip ?? 'unknown'}:${(req as { actor?: { id: string } }).actor?.id ?? ''}`,
  handler: (req, res) => sendRateLimited(String((req as { id?: string }).id ?? ''), res),
});
