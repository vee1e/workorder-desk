import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CursorPage, Metrics, OffsetPage, Role, UserAdmin, WorkOrderPublic } from '@workorders/shared';
import { api } from '../../api/client';
import type { WorkOrderFilters } from '../workOrders/queries';

export function useAdminUsers(page: number, limit: number, role?: Role, search?: string) {
  return useQuery({
    queryKey: ['admin', 'users', { page, limit, role, search }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (role) params.set('role', role);
      if (search) params.set('search', search);
      return api.get<OffsetPage<UserAdmin>>(`/admin/users?${params.toString()}`);
    },
  });
}

export function useAdminWorkOrders(filters: WorkOrderFilters, cursor?: string) {
  return useQuery({
    queryKey: ['admin', 'work-orders', filters, cursor ?? null],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '20' });
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.search) params.set('search', filters.search);
      if (cursor) params.set('cursor', cursor);
      return api.get<CursorPage<WorkOrderPublic>>(`/admin/work-orders?${params.toString()}`);
    },
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.patch<UserAdmin>(`/admin/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<UserAdmin>(`/admin/users/${id}/status`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useMetrics() {
  return useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: () => api.get<Metrics>('/admin/metrics'),
  });
}