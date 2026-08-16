import type { Response } from 'express';
import { ACCESS_COOKIE, ACCESS_TOKEN_TTL_SECONDS, REFRESH_COOKIE, REFRESH_TOKEN_TTL_SECONDS } from '@workorders/shared';
import { env } from '../config/env.js';

const secure = env.NODE_ENV === 'production';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function setAuthCookies(res: Response, tokens: TokenPair): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    signed: true,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    signed: true,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/api/v1/auth' });
}