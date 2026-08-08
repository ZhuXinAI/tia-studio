import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AgentMemory, SaveAgentMemoryInput } from '../../../../shared/memory'
import { createApiClient } from '../../lib/api-client'

const api = createApiClient()

export const memoryKeys = {
  all: ['memories'] as const,
  list: (workspaceId?: string | null) => [...memoryKeys.all, workspaceId ?? 'all'] as const
}

export function useMemories(workspaceId?: string | null) {
  return useQuery({
    queryKey: memoryKeys.list(workspaceId),
    queryFn: () =>
      api.get<AgentMemory[]>(
        workspaceId ? `/v1/memories?workspaceId=${encodeURIComponent(workspaceId)}` : '/v1/memories'
      )
  })
}

export function useCreateMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveAgentMemoryInput) => api.post<AgentMemory>('/v1/memories', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memoryKeys.all })
  })
}

export function useUpdateMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SaveAgentMemoryInput }) =>
      api.put<AgentMemory>(`/v1/memories/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memoryKeys.all })
  })
}

export function useDeleteMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/memories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memoryKeys.all })
  })
}
