import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createApiClient } from '../../lib/api-client'

export type AssistantCodingApprovalMode = 'untrusted' | 'on-failure' | 'on-request' | 'never'
export type AssistantCodingSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export type AssistantCodingConfig = {
  enabled?: boolean
  cwd?: string
  addDirs?: string[]
  skipGitRepoCheck?: boolean
  fullAuto?: boolean
  approvalMode?: AssistantCodingApprovalMode
  sandboxMode?: AssistantCodingSandboxMode
}

export type AssistantRecord = {
  id: string
  name: string
  description: string
  instructions: string
  enabled: boolean
  providerId: string
  workspaceConfig: Record<string, unknown>
  skillsConfig: Record<string, unknown>
  codingConfig?: AssistantCodingConfig
  mcpConfig: Record<string, boolean>
  maxSteps: number
  memoryConfig: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type SaveAssistantInput = {
  name: string
  description?: string
  instructions?: string
  enabled?: boolean
  providerId: string
  workspaceConfig?: Record<string, unknown>
  skillsConfig?: Record<string, unknown>
  codingConfig?: AssistantCodingConfig
  mcpConfig?: Record<string, boolean>
  maxSteps?: number
  memoryConfig?: Record<string, unknown> | null
}

const apiClient = createApiClient()

// Query keys for cache management
export const assistantKeys = {
  all: ['assistants'] as const,
  lists: () => [...assistantKeys.all, 'list'] as const,
  detail: (id: string) => [...assistantKeys.all, 'detail', id] as const,
  heartbeat: (id: string) => [...assistantKeys.detail(id), 'heartbeat'] as const
}

// Legacy functions (kept for backward compatibility during migration)
export async function listAssistants(): Promise<AssistantRecord[]> {
  return apiClient.get<AssistantRecord[]>('/v1/assistants')
}

export async function createAssistant(input: SaveAssistantInput): Promise<AssistantRecord> {
  return apiClient.post<AssistantRecord>('/v1/assistants', input)
}

export async function updateAssistant(
  assistantId: string,
  input: Partial<SaveAssistantInput>
): Promise<AssistantRecord> {
  return apiClient.patch<AssistantRecord>(`/v1/assistants/${assistantId}`, input)
}

export async function deleteAssistant(assistantId: string): Promise<void> {
  await apiClient.delete(`/v1/assistants/${assistantId}`)
}

// TanStack Query hooks
export function useAssistants() {
  return useQuery({
    queryKey: assistantKeys.lists(),
    queryFn: listAssistants
  })
}

export function useCreateAssistant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createAssistant,
    onSuccess: () => {
      // Invalidate and refetch assistants list
      queryClient.invalidateQueries({ queryKey: assistantKeys.lists() })
    }
  })
}

export function useUpdateAssistant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SaveAssistantInput> }) =>
      updateAssistant(id, input),
    onSuccess: () => {
      // Invalidate and refetch assistants list
      queryClient.invalidateQueries({ queryKey: assistantKeys.lists() })
    }
  })
}

export function useDeleteAssistant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteAssistant,
    onSuccess: () => {
      // Invalidate and refetch assistants list
      queryClient.invalidateQueries({ queryKey: assistantKeys.lists() })
    }
  })
}
