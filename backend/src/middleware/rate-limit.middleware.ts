import rateLimit from 'express-rate-limit';
import type { ErrorEnvelope } from '@workorders/shared';
import { env } from '../config/env.js';

function sendRateLimited(requestId: string, res: { status: (code: number) => { json: (body: unknown) => void } }): void {
  const body: ErrorEnvelope = {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' },
    requestId,
  };
  res.status(429).json(body);
}

export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.ip ?? 'unknown') as string,
  skip: (req) => req.path === '/health' || req.path === '/ready',
  handler: (req, res) => sendRateLimited((req as { id?: string }).id ?? '', res),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.ip ?? 'unknown') as string,
  handler: (req, res) => sendRateLimited((req as { id?: string }).id ?? '', res),
});

export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.ip ?? 'unknown') as string,
  handler: (req, res) => sendRateLimited((req as { id?: string }).id ?? '', res),
});

export const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_FORGOT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip ?? 'unknown'}:${(req.body as { email?: string } | undefined)?.email ?? ''}`,
  handler: (req, res) => sendRateLimited((req as { id?: string }).id ?? '', res),
});