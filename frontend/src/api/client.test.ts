import { describe, expect, it, vi, beforeEach } from 'vitest';
import { api } from './client';
import { ApiError } from '../lib/errors';

function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function mockFetchQueue(...responses: ReturnType<typeof mockResponse>[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const errEnvelope = {
  success: false,
  error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
  requestId: 'r-1',
};

describe('api client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the data from a success envelope', async () => {
    const fetchMock = mockFetchQueue(mockResponse(200, { success: true, data: { hello: 'world' } }));
    await expect(api.get('/health')).resolves.toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({ credentials: 'include' }));
  });

  it('returns undefined for 204 responses', async () => {
    const fetchMock = mockFetchQueue(mockResponse(204, null));
    await expect(api.post('/auth/logout')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws an ApiError from an error envelope', async () => {
    mockFetchQueue(
      mockResponse(403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Forbidden' },
        requestId: 'r-1',
      }),
    );
    await expect(api.get('/admin/users')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      requestId: 'r-1',
    });
  });

  it('throws on a non-envelope success response', async () => {
    mockFetchQueue(mockResponse(200, { success: false }));
    await expect(api.get('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('single-flights a refresh and retries the original request once', async () => {
    const fetchMock = mockFetchQueue(
      mockResponse(401, errEnvelope),
      mockResponse(200, { success: true, data: { email: 'a@b.com' } }),
      mockResponse(200, { success: true, data: { hello: 'world' } }),
    );
    await expect(api.get('/users/me')).resolves.toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/auth/refresh');
  });

  it('redirects to /login when refresh fails', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { assign },
    });
    mockFetchQueue(mockResponse(401, errEnvelope), mockResponse(401, errEnvelope));
    await expect(api.get('/users/me')).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('does not redirect (reload) when already on /login', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { assign, pathname: '/login' },
    });
    mockFetchQueue(mockResponse(401, errEnvelope), mockResponse(401, errEnvelope));
    await expect(api.get('/users/me')).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });
});