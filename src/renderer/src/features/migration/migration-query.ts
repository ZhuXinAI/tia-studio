import { createApiClient } from '../../lib/api-client'

export type MigrationStatus = {
  needsMigration: boolean
  channelCountToRebind: number
  legacyCleanup: {
    heartbeat: 'removed'
    scheduling: 'removed'
  }
  defaultAssistantName: string
}

export type MigrationRunResult = {
  ok: true
  migratedChannelCount: number
  status: MigrationStatus
}

const apiClient = createApiClient()

export async function getMigrationStatus(): Promise<MigrationStatus> {
  return apiClient.get<MigrationStatus>('/v1/migration/status')
}

export async function runMigration(): Promise<MigrationRunResult> {
  return apiClient.post<MigrationRunResult>('/v1/migration/run')
}
