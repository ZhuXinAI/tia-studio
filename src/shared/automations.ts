export type TiaAutomationStatus = 'active' | 'paused'

export type TiaAutomationRecord = {
  id: string
  name: string
  prompt: string
  status: TiaAutomationStatus
  rrule: string
  workspaceId: string
  providerId: string
  modelId: string
  nextRunAt: string | null
  lastRunAt: string | null
  lastSessionId: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type SaveTiaAutomationInput = {
  name: string
  prompt: string
  status: TiaAutomationStatus
  rrule: string
  workspaceId: string
  providerId: string
  modelId: string
}
