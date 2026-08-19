import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentConfig,
  AgentRun,
  AgentToolCall,
  CursorPage,
  Metrics,
  OffsetPage,
  Role,
  TriageMode,
  UserAdmin,
  WorkOrderPriority,
  WorkOrderPublic,
} from '@workorders/shared';
import { api } from '../../api/client';
import type { WorkOrderFilters } from '../workOrders/queries';

export interface AgentMessage {
  runId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

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
    placeholderData: (prev) => prev,
  });
}

function patchUserInCache(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  patch: (u: UserAdmin) => UserAdmin,
): void {
  qc.setQueriesData<OffsetPage<UserAdmin>>({ queryKey: ['admin', 'users'] }, (old) => {
    if (!old) return old;
    return { ...old, items: old.items.map((u) => (u.id === id ? patch(u) : u)) };
  });
}

export { patchUserInCache };

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.patch<UserAdmin>(`/admin/users/${id}/role`, { role }),
    onMutate: async ({ id, role }) => {
      await qc.cancelQueries({ queryKey: ['admin', 'users'] });
      const previous = qc.getQueriesData({ queryKey: ['admin', 'users'] });
      patchUserInCache(qc, id, (u) => ({ ...u, role }));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.previous ?? []) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<UserAdmin>(`/admin/users/${id}/status`, { isActive }),
    onMutate: async ({ id, isActive }) => {
      await qc.cancelQueries({ queryKey: ['admin', 'users'] });
      const previous = qc.getQueriesData({ queryKey: ['admin', 'users'] });
      patchUserInCache(qc, id, (u) => ({ ...u, isActive }));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.previous ?? []) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useToggleAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, aiEnabled }: { id: string; aiEnabled: boolean }) =>
      api.patch<UserAdmin>(`/admin/users/${id}/ai`, { aiEnabled }),
    onMutate: async ({ id, aiEnabled }) => {
      await qc.cancelQueries({ queryKey: ['admin', 'users'] });
      const previous = qc.getQueriesData({ queryKey: ['admin', 'users'] });
      patchUserInCache(qc, id, (u) => ({ ...u, aiEnabled }));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.previous ?? []) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useAgentConfig() {
  return useQuery({
    queryKey: ['admin', 'agents', 'triage', 'config'],
    queryFn: () => api.get<AgentConfig>('/admin/agents/triage'),
  });
}

export function useUpdateAgentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      mode?: TriageMode;
      dailyActionCap?: number;
      flagThreshold?: WorkOrderPriority;
      workingHours?: string;
    }) => api.patch<AgentConfig>('/admin/agents/triage/config', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'agents'] }),
  });
}

export function useDisableAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ enabled: false }>('/admin/agents/disable'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'agents'] }),
  });
}

export function useManualTriageRun() {
  return useMutation({
    mutationFn: (workOrderId?: string) =>
      api.post<{ outcome: 'done' | 'skipped' | 'failed' | 'retry'; runId: string | null }>(
        '/admin/agents/triage/run',
        workOrderId ? { workOrderId } : {},
      ),
  });
}

export function useAgentRuns(page: number, limit: number) {
  return useQuery({
    queryKey: ['admin', 'agents', 'runs', { page, limit }],
    queryFn: () => api.get<OffsetPage<AgentRun>>(`/admin/agents/runs?page=${page}&limit=${limit}`),
    placeholderData: (prev) => prev,
  });
}

export function useAgentRunDetail(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'agents', 'runs', 'detail', id],
    queryFn: () =>
      api.get<{ run: AgentRun; messages: AgentMessage[]; toolCalls: AgentToolCall[] }>(
        `/admin/agents/runs/${id}`,
      ),
    enabled: Boolean(id),
  });
}

export function useMetrics() {
  return useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: () => api.get<Metrics>('/admin/metrics'),
  });
}