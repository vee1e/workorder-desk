import { useMutation, useQuery } from '@tanstack/react-query';
import type { AgentToolCall, CopilotSession } from '@workorders/shared';
import { api } from '../../api/client';

export function useCopilotSession() {
  return useQuery({
    queryKey: ['ai', 'session'],
    queryFn: async (): Promise<CopilotSession> => {
      const sessions = await api.get<CopilotSession[]>('/ai/sessions');
      const active = sessions.find((s) => s.status === 'active');
      if (active) return active;
      return api.post<CopilotSession>('/ai/sessions');
    },
  });
}

export function useDecideApproval() {
  return useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api.post<AgentToolCall>(`/ai/tool-calls/${id}/decide`, { approve }),
  });
}

export { useToggleAi } from '../admin/queries';