import { createApiClient } from '../../lib/api-client'

export type AssistantRecord = {
  id: string
  name: string
  instructions: string
  providerId: string
  workspaceConfig: Record<string, unknown>
  skillsConfig: Record<string, unknown>
  mcpConfig: Record<string, boolean>
  maxSteps: number
  memoryConfig: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type SaveAssistantInput = {
  name: string
  instructions?: string
  providerId: string
  workspaceConfig?: Record<string, unknown>
  skillsConfig?: Record<string, unknown>
  mcpConfig?: Record<string, boolean>
  maxSteps?: number
  memoryConfig?: Record<string, unknown> | null
}

const apiClient = createApiClient()

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
