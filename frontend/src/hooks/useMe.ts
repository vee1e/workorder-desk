import { useQuery } from '@tanstack/react-query';
import type { UserPublic } from '@workorders/shared';
import { api } from '../api/client';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<UserPublic>('/users/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}