import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateWorkOrder, useDeleteWorkOrder, useUpdateWorkOrder, useWorkOrder, useWorkOrderBoard } from './queries';
import { createQueryClient } from '../../test/utils';

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../../api/client';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

const wo = {
  id: 'wo1',
  title: 'Job',
  description: null,
  priority: 'medium' as const,
  status: 'pending' as const,
  owner: { id: 'u1', name: 'Tech', email: 't@example.com' },
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('work order queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists own work orders with a query string', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [wo], nextCursor: 'abc' });
    const { result } = renderHook(() => useWorkOrderBoard({ status: 'pending', priority: 'high' }, undefined, 'own'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/work-orders?status=pending&priority=high&limit=20');
    expect(result.current.data?.items[0]?.title).toBe('Job');
  });

  it('lists all work orders through the admin endpoint when mode is all', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [wo], nextCursor: null });
    const { result } = renderHook(() => useWorkOrderBoard({}, undefined, 'all'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/admin/work-orders?limit=20');
  });

  it('fetches a single work order only when an id is provided', () => {
    renderHook(() => useWorkOrder('wo1'), { wrapper });
    expect(api.get).toHaveBeenCalledWith('/work-orders/wo1');
  });

  it('creates a work order', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue(wo);
    const { result } = renderHook(() => useCreateWorkOrder(), { wrapper });
    await result.current.mutateAsync({ title: 'Job', priority: 'high' });
    expect(api.post).toHaveBeenCalledWith('/work-orders', { title: 'Job', priority: 'high' });
  });

  it('updates a work order with its version', async () => {
    (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue(wo);
    const { result } = renderHook(() => useUpdateWorkOrder('wo1'), { wrapper });
    await result.current.mutateAsync({ title: 'Renamed', version: 1 });
    expect(api.patch).toHaveBeenCalledWith('/work-orders/wo1', { title: 'Renamed', version: 1 });
  });

  it('deletes a work order with its version', async () => {
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteWorkOrder('wo1'), { wrapper });
    await result.current.mutateAsync(1);
    expect(api.delete).toHaveBeenCalledWith('/work-orders/wo1', { version: 1 });
  });
});