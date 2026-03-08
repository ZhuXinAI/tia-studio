import { createApiClient } from '../../../lib/api-client'

export type CronJobRunStatus = 'success' | 'failed' | null

export type CronJobRecord = {
  id: string
  assistantId: string
  threadId: string | null
  name: string
  prompt: string
  cronExpression: string
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  lastRunStatus: CronJobRunStatus
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type CreateCronJobInput = {
  assistantId: string
  name: string
  prompt: string
  cronExpression: string
  enabled?: boolean
}

export type UpdateCronJobInput = Partial<CreateCronJobInput>

const apiClient = createApiClient()

export async function listCronJobs(): Promise<CronJobRecord[]> {
  return apiClient.get<CronJobRecord[]>('/v1/cron-jobs')
}

export async function createCronJob(input: CreateCronJobInput): Promise<CronJobRecord> {
  return apiClient.post<CronJobRecord>('/v1/cron-jobs', input)
}

export async function updateCronJob(
  cronJobId: string,
  input: UpdateCronJobInput
): Promise<CronJobRecord> {
  return apiClient.patch<CronJobRecord>(`/v1/cron-jobs/${cronJobId}`, input)
}

export async function deleteCronJob(cronJobId: string): Promise<void> {
  await apiClient.delete(`/v1/cron-jobs/${cronJobId}`)
}
