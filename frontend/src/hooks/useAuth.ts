import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterInput, UserPublic } from '@workorders/shared';
import { api } from '../api/client';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<UserPublic>('/users/me'),
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<UserPublic>('/auth/login', input),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => api.post<UserPublic>('/auth/register', input),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => {
      qc.clear();
    },
  });
}