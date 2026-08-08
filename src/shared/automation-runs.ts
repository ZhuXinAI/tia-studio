export type AutomationRunStatus = 'running' | 'needs-review' | 'completed' | 'failed'

export type AutomationRunRecord = {
  id: string
  automationId: string
  sessionId: string | null
  status: AutomationRunStatus
  startedAt: string
  completedAt: string | null
  summary: string | null
  error: string | null
}
