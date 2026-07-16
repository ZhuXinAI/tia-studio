import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createApiClient } from '../../lib/api-client'

export type WorkspaceRecord = {
  id: string
  name: string
  rootPath: string
  builtInKind: 'chats' | null
  isMissing: boolean
}

type CreateWorkspaceInput = {
  name: string
  rootPath: string
}

type RelocateWorkspaceInput = {
  rootPath: string
}

const apiClient = createApiClient()

export const workspaceKeys = {
  all: ['workspaces'] as const,
  list: () => [...workspaceKeys.all, 'list'] as const
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  return apiClient.get<WorkspaceRecord[]>('/v1/workspaces')
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
  return apiClient.post<WorkspaceRecord>('/v1/workspaces', input)
}

export async function relocateWorkspace(
  workspaceId: string,
  input: RelocateWorkspaceInput
): Promise<WorkspaceRecord> {
  return apiClient.patch<WorkspaceRecord>(`/v1/workspaces/${workspaceId}`, input)
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await apiClient.delete(`/v1/workspaces/${workspaceId}`)
}

export function useWorkspaces(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: listWorkspaces,
    enabled: options?.enabled !== false
  })
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() })
    }
  })
}

export function useRelocateWorkspace() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ workspaceId, input }: { workspaceId: string; input: RelocateWorkspaceInput }) =>
      relocateWorkspace(workspaceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() })
    }
  })
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() })
    }
  })
}
