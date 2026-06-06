import { useQuery } from '@tanstack/react-query'
import { createApiClient } from '../../lib/api-client'

export type AssistantRecord = {
  id: string
  name: string
  description: string
  instructions: string
  enabled: boolean
  providerId: string
  workspaceConfig: Record<string, unknown>
  skillsConfig: Record<string, unknown>
  mcpConfig: Record<string, boolean>
  maxSteps: number
  memoryConfig: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

const apiClient = createApiClient()

export const assistantKeys = {
  all: ['assistants'] as const,
  lists: () => [...assistantKeys.all, 'list'] as const
}

export async function listAssistants(): Promise<AssistantRecord[]> {
  return apiClient.get<AssistantRecord[]>('/v1/assistants')
}

export function useAssistants() {
  return useQuery({
    queryKey: assistantKeys.lists(),
    queryFn: listAssistants
  })
}
