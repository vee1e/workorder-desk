import { ApiError } from '../lib/errors';
import type { ApiFieldError } from '../lib/errors';

const BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

let refreshPromise: Promise<boolean> | null = null;

function refreshTokens(): Promise<boolean> {
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

interface ErrorEnvelopeShape {
  error?: { message?: string; code?: string; details?: ApiFieldError[]; requestId?: string };
}

async function parseErrorEnvelope(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const err = (body ?? null) as ErrorEnvelopeShape | null;
  return new ApiError(
    err?.error?.message ?? 'Request failed',
    err?.error?.code ?? 'INTERNAL',
    err?.error?.details,
    err?.error?.requestId,
    res.status,
  );
}

export interface PostEventStreamOpts {
  signal?: AbortSignal;
  onEvent: (event: string, data: unknown) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

async function streamOnce(path: string, body: unknown, opts: PostEventStreamOpts): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    throw await parseErrorEnvelope(res);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  opts.signal?.addEventListener('abort', onAbort, { once: true });

  let buffer = '';
  let eventName = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let data: string | null = null;
        for (const line of raw.split('\n')) {
          const clean = line.replace(/\r$/, '');
          if (clean.startsWith('event: ')) eventName = clean.slice(7).trim();
          else if (clean.startsWith('data: ')) data = clean.slice(6).trim();
        }
        if (data && data.length > 0) {
          try {
            opts.onEvent(eventName, JSON.parse(data));
          } catch {
            // malformed payload; skip and keep streaming
          }
        }
        eventName = '';
      }
    }
    opts.onDone?.();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    opts.onError?.(err instanceof Error ? err : new Error('Stream read failed'));
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {
      // reader already released
    }
  }
}

export async function postEventStream(
  path: string,
  body: unknown,
  opts: PostEventStreamOpts,
): Promise<void> {
  try {
    await streamOnce(path, body, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !path.startsWith('/auth/')) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        await streamOnce(path, body, opts);
        return;
      }
      throw new ApiError('Session expired', 'UNAUTHORIZED', undefined, undefined, 401);
    }
    throw err;
  }
}