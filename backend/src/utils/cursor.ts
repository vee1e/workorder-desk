import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export interface CursorPayload {
  createdAt: string;
  id: string;
}

function hmac(data: string): string {
  return createHmac('sha256', env.COOKIE_SECRET).update(data).digest('base64url');
}

export function signCursor(payload: CursorPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${hmac(body)}.${body}`;
}

export function verifyCursor(cursor: string): CursorPayload | null {
  const idx = cursor.indexOf('.');
  if (idx <= 0) return null;
  const signature = cursor.slice(0, idx);
  const body = cursor.slice(idx + 1);
  const expected = hmac(body);
  const sig = Buffer.from(signature);
  const exp = Buffer.from(expected);
  if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as CursorPayload).createdAt === 'string' &&
      typeof (parsed as CursorPayload).id === 'string'
    ) {
      return parsed as CursorPayload;
    }
  } catch {
    // fall through
  }
  return null;
}