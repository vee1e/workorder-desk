import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useAgentConfig,
  useAgentRunDetail,
  useAgentRuns,
  useAdminUsers,
  useDisableAgent,
  useManualTriageRun,
  useMetrics,
  useToggleAi,
  useUpdateAgentConfig,
  useUpdateRole,
  useUpdateStatus,
} from './queries';
import { createQueryClient } from '../../test/utils';

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../../api/client';

function makeWrapper(qc: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const defaultWrapper = makeWrapper(createQueryClient());

const user = {
  id: 'u1',
  email: 'a@b.com',
  name: 'A',
  role: 'user' as const,
  isActive: true,
  lastLoginAt: null,
  aiEnabled: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const config = {
  name: 'triage',
  enabled: true,
  mode: 'suggest' as const,
  allowedFields: ['priority'],
  dailyActionCap: 5,
  flagThreshold: 'medium' as const,
  workingHours: '08:00-18:00',
  updatedBy: null,
  updatedAt: '2026-01-01T00:00:00Z',
};

const run = {
  id: 'r1',
  mode: 'copilot' as const,
  actorId: null,
  status: 'complete' as const,
  model: 'gpt-4o',
  inputTokens: 10,
  outputTokens: 5,
  startedAt: '2026-01-01T00:00:00Z',
  finishedAt: '2026-01-01T00:00:00Z',
};

const page = { items: [user], page: 1, limit: 20, total: 1 };

describe('admin queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches admin users with filters', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(page);
    const { result } = renderHook(() => useAdminUsers(1, 20, 'admin', 'alice'), {
      wrapper: defaultWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith('/admin/users?page=1&limit=20&role=admin&search=alice');
  });

  it('fetches the agent config', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(config);
    const { result } = renderHook(() => useAgentConfig(), { wrapper: defaultWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith('/admin/agents/triage');
    expect(result.current.data?.mode).toBe('suggest');
  });

  it('updates the agent config', async () => {
    (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ ...config, mode: 'auto-apply' });
    const { result } = renderHook(() => useUpdateAgentConfig(), { wrapper: defaultWrapper });

    await act(async () => {
      await result.current.mutateAsync({
        mode: 'auto-apply',
        dailyActionCap: 10,
        flagThreshold: 'high',
        workingHours: '09:00-17:00',
      });
    });

    expect(api.patch).toHaveBeenCalledWith('/admin/agents/triage/config', {
      mode: 'auto-apply',
      dailyActionCap: 10,
      flagThreshold: 'high',
      workingHours: '09:00-17:00',
    });
  });

  it('disables the agent', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useDisableAgent(), { wrapper: defaultWrapper });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(api.post).toHaveBeenCalledWith('/admin/agents/disable');
  });

  it('runs triage with and without a work order id', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ outcome: 'done' });
    const { result } = renderHook(() => useManualTriageRun(), { wrapper: defaultWrapper });

    await act(async () => {
      await result.current.mutateAsync('wo1');
    });
    expect(api.post).toHaveBeenCalledWith('/admin/agents/triage/run', { workOrderId: 'wo1' });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(api.post).toHaveBeenLastCalledWith('/admin/agents/triage/run', {});
  });

  it('lists agent runs', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [run],
      page: 1,
      limit: 20,
      total: 1,
    });
    const { result } = renderHook(() => useAgentRuns(1, 20), { wrapper: defaultWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith('/admin/agents/runs?page=1&limit=20');
  });

  it('fetches an agent run detail only when an id is provided', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ run, messages: [], toolCalls: [] });
    const { result } = renderHook(() => useAgentRunDetail('r1'), { wrapper: defaultWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/admin/agents/runs/r1');

    renderHook(() => useAgentRunDetail(null), { wrapper: defaultWrapper });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('optimistically toggles aiEnabled in the admin users cache', async () => {
    const qc = createQueryClient();
    const key = ['admin', 'users', { page: 1, limit: 20, role: undefined, search: undefined }];
    qc.setQueryData(key, page);

    let resolvePatch!: (v: unknown) => void;
    (api.patch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolvePatch = resolve; }),
    );
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(page);

    const { result } = renderHook(() => useToggleAi(), { wrapper: makeWrapper(qc) });

    let mutatePromise: Promise<unknown> | undefined;
    act(() => {
      mutatePromise = result.current.mutateAsync({ id: 'u1', aiEnabled: true });
    });

    await waitFor(() => {
      const data = qc.getQueryData<{ items: Array<typeof user> }>(key);
      expect(data?.items[0]?.aiEnabled).toBe(true);
    });

    await act(async () => {
      resolvePatch(user);
      await mutatePromise;
    });

    expect(api.patch).toHaveBeenCalledWith('/admin/users/u1/ai', { aiEnabled: true });
  });

  it('optimistically updates a user role and rolls back on error', async () => {
    const qc = createQueryClient();
    const key = ['admin', 'users', { page: 1, limit: 20, role: undefined, search: undefined }];
    qc.setQueryData(key, page);

    (api.patch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(page);

    const { result } = renderHook(() => useUpdateRole(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'u1', role: 'admin' })).rejects.toThrow('nope');
    });

    const data = qc.getQueryData<{ items: Array<typeof user> }>(key);
    expect(data?.items[0]?.role).toBe('user');
  });

  it('optimistically updates a user status and rolls back on error', async () => {
    const qc = createQueryClient();
    const key = ['admin', 'users', { page: 1, limit: 20, role: undefined, search: undefined }];
    qc.setQueryData(key, page);

    (api.patch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(page);

    const { result } = renderHook(() => useUpdateStatus(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'u1', isActive: false })).rejects.toThrow('nope');
    });

    const data = qc.getQueryData<{ items: Array<typeof user> }>(key);
    expect(data?.items[0]?.isActive).toBe(true);
  });

  it('fetches metrics', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ users: 1, workOrders: 2, uptimeSeconds: 3 });
    const { result } = renderHook(() => useMetrics(), { wrapper: defaultWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith('/admin/metrics');
  });
});