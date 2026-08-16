import type { ErrorEnvelope, SuccessEnvelope } from '@workorders/shared';
import { ApiError } from '../lib/errors';

const BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

let refreshPromise: Promise<boolean> | null = null;

async function parseEnvelope<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body as ErrorEnvelope | null;
    throw new ApiError(
      err?.error?.message ?? 'Request failed',
      err?.error?.code ?? 'INTERNAL',
      err?.error?.details,
      err?.requestId,
      res.status,
    );
  }
  const envelope = body as SuccessEnvelope<T> | null;
  if (!envelope?.success) {
    throw new ApiError('Invalid response envelope', 'INTERNAL');
  }
  return envelope.data;
}

function requestEnvelope<T>(path: string, init: RequestInit): Promise<T> {
  return fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  }).then((res) => parseEnvelope<T>(res));
}

async function refreshTokens(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit, retried = false): Promise<T> {
  try {
    return await requestEnvelope<T>(path, init);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !retried && !path.startsWith('/auth/')) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        return request<T>(path, init, true);
      }
      if (typeof window !== 'undefined') {
        window.location.assign('/login');
      }
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'DELETE', body: JSON.stringify(body ?? {}) }),
};