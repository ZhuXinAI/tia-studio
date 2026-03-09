import { createApiClient } from '../../lib/api-client'

export type HeartbeatRunStatus = 'success' | 'failed'

export type AssistantHeartbeatRecord = {
  id: string
  assistantId: string
  enabled: boolean
  intervalMinutes: number
  prompt: string
  threadId: string | null
  lastRunAt: string | null
  nextRunAt: string | null
  lastRunStatus: HeartbeatRunStatus | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type SaveAssistantHeartbeatInput = {
  enabled: boolean
  intervalMinutes: number
  prompt: string
}

export const DEFAULT_ASSISTANT_HEARTBEAT_INTERVAL_MINUTES = 30
export const DEFAULT_ASSISTANT_HEARTBEAT_PROMPT =
  'Review recent work logs and recent conversations. Follow up only if needed.'

const apiClient = createApiClient()

export async function getAssistantHeartbeat(
  assistantId: string
): Promise<AssistantHeartbeatRecord | null> {
  return apiClient.get<AssistantHeartbeatRecord | null>(`/v1/assistants/${assistantId}/heartbeat`)
}

export async function updateAssistantHeartbeat(
  assistantId: string,
  input: SaveAssistantHeartbeatInput
): Promise<AssistantHeartbeatRecord> {
  return apiClient.patch<AssistantHeartbeatRecord>(`/v1/assistants/${assistantId}/heartbeat`, input)
}
