import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLogin, useLogout, useMe } from './useAuth';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../api/client';

const user = {
  id: 'u1',
  email: 'tech@example.com',
  name: 'Tech',
  role: 'user' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useMe fetches the current user', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMe(), { wrapper: makeWrapper(qc) });
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/users/me');
    expect(result.current.data?.email).toBe('tech@example.com');
  });

  it('useLogin posts credentials and caches the user as me', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLogin(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync({ email: 'tech@example.com', password: 'Password123' });
    });
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'tech@example.com', password: 'Password123' });
    expect(qc.getQueryData(['me'])).toEqual(user);
  });

  it('useLogout posts logout and clears the cache', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['me'], user);
    const { result } = renderHook(() => useLogout(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(qc.getQueryData(['me'])).toBeUndefined();
  });
});