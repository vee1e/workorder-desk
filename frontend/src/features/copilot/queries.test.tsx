import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCopilotSession, useDecideApproval } from './queries';
import { createQueryClient } from '../../test/utils';

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../../api/client';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

const session = {
  id: 's1',
  userId: 'u1',
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('copilot queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses an active session when one exists', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue([
      session,
      { ...session, id: 's2', status: 'archived' as const },
    ]);
    const { result } = renderHook(() => useCopilotSession(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith('/ai/sessions');
    expect(api.post).not.toHaveBeenCalled();
    expect(result.current.data?.id).toBe('s1');
  });

  it('creates a new session when none is active', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...session, id: 'old', status: 'expired' as const },
    ]);
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue(session);
    const { result } = renderHook(() => useCopilotSession(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith('/ai/sessions');
    expect(result.current.data?.id).toBe('s1');
  });

  it('decides a tool approval', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tc1', runId: 'r1' });
    const { result } = renderHook(() => useDecideApproval(), { wrapper });

    await result.current.mutateAsync({ id: 'tc1', approve: true });

    expect(api.post).toHaveBeenCalledWith('/ai/tool-calls/tc1/decide', { approve: true });
  });
});