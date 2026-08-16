import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CursorPage, WorkOrderPriority, WorkOrderPublic, WorkOrderStatus } from '@workorders/shared';
import { api } from '../../api/client';

export interface WorkOrderFilters {
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  search?: string;
}

function queryString(filters: WorkOrderFilters, cursor?: string): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.search) params.set('search', filters.search);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', '20');
  return params.toString();
}

export type BoardMode = 'own' | 'all';

export function useWorkOrderBoard(filters: WorkOrderFilters, cursor: string | undefined, mode: BoardMode) {
  return useQuery({
    queryKey: ['board', mode, filters, cursor ?? null],
    queryFn: () => {
      const path = mode === 'all' ? '/admin/work-orders' : '/work-orders';
      return api.get<CursorPage<WorkOrderPublic>>(`${path}?${queryString(filters, cursor)}`);
    },
    placeholderData: (prev) => prev,
  });
}

export function useWorkOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['work-orders', 'detail', id],
    queryFn: () => api.get<WorkOrderPublic>(`/work-orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; description?: string | null; priority?: WorkOrderPriority; status?: WorkOrderStatus }) =>
      api.post<WorkOrderPublic>('/work-orders', input),
    onSuccess: () => invalidateBoards(qc),
  });
}

export function useUpdateWorkOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title?: string;
      description?: string | null;
      priority?: WorkOrderPriority;
      status?: WorkOrderStatus;
      version: number;
    }) => api.patch<WorkOrderPublic>(`/work-orders/${id}`, input),
    onSuccess: (wo) => {
      invalidateBoards(qc);
      qc.setQueryData(['work-orders', 'detail', id], wo);
    },
  });
}

export function useDeleteWorkOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.delete<void>(`/work-orders/${id}`, { version }),
    onSuccess: () => {
      invalidateBoards(qc);
      qc.removeQueries({ queryKey: ['work-orders', 'detail', id] });
    },
  });
}

export function invalidateBoards(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ['board'] });
  qc.invalidateQueries({ queryKey: ['admin', 'work-orders'] });
}