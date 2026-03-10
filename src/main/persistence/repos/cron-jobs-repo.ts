import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type CronJobRunStatus = 'success' | 'failed'

export type AppCronJob = {
  id: string
  assistantId: string
  threadId: string | null
  name: string
  prompt: string
  cronExpression: string
  enabled: boolean
  recurring: boolean
  channelId: string | null
  remoteChatId: string | null
  lastRunAt: string | null
  nextRunAt: string | null
  lastRunStatus: CronJobRunStatus | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type CreateCronJobInput = {
  assistantId: string
  threadId?: string | null
  name: string
  prompt: string
  cronExpression: string
  enabled?: boolean
  recurring?: boolean
  channelId?: string | null
  remoteChatId?: string | null
  lastRunAt?: string | null
  nextRunAt?: string | null
  lastRunStatus?: CronJobRunStatus | null
  lastError?: string | null
}

export type UpdateCronJobInput = Partial<CreateCronJobInput>

const CRON_JOB_SELECT = `
  SELECT
    id,
    assistant_id,
    thread_id,
    name,
    prompt,
    cron_expression,
    enabled,
    recurring,
    channel_id,
    remote_chat_id,
    last_run_at,
    next_run_at,
    last_run_status,
    last_error,
    created_at,
    updated_at
  FROM app_cron_jobs
`

function parseCronJobStatus(value: unknown): CronJobRunStatus | null {
  if (value === 'success' || value === 'failed') {
    return value
  }

  return null
}

function parseCronJobRow(row: Record<string, unknown>): AppCronJob {
  return {
    id: String(row.id),
    assistantId: String(row.assistant_id),
    threadId: row.thread_id ? String(row.thread_id) : null,
    name: String(row.name),
    prompt: String(row.prompt),
    cronExpression: String(row.cron_expression),
    enabled: Number(row.enabled) === 1,
    recurring: Number(row.recurring ?? 1) === 1,
    channelId: row.channel_id ? String(row.channel_id) : null,
    remoteChatId: row.remote_chat_id ? String(row.remote_chat_id) : null,
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    lastRunStatus: parseCronJobStatus(row.last_run_status),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class CronJobsRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppCronJob[]> {
    const result = await this.db.execute(`${CRON_JOB_SELECT} ORDER BY created_at DESC`)

    return result.rows.map((row) => parseCronJobRow(row as Record<string, unknown>))
  }

  async listEnabled(): Promise<AppCronJob[]> {
    const result = await this.db.execute(
      `${CRON_JOB_SELECT} WHERE enabled = 1 ORDER BY created_at DESC`
    )

    return result.rows.map((row) => parseCronJobRow(row as Record<string, unknown>))
  }

  async listByAssistantId(assistantId: string): Promise<AppCronJob[]> {
    const result = await this.db.execute(
      `${CRON_JOB_SELECT} WHERE assistant_id = ? ORDER BY created_at DESC`,
      [assistantId]
    )

    return result.rows.map((row) => parseCronJobRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppCronJob | null> {
    const result = await this.db.execute(`${CRON_JOB_SELECT} WHERE id = ? LIMIT 1`, [id])
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseCronJobRow(row as Record<string, unknown>)
  }

  async create(input: CreateCronJobInput): Promise<AppCronJob> {
    const id = randomUUID()

    await this.db.execute(
      `
        INSERT INTO app_cron_jobs (
          id,
          assistant_id,
          thread_id,
          name,
          prompt,
          cron_expression,
          enabled,
          recurring,
          channel_id,
          remote_chat_id,
          last_run_at,
          next_run_at,
          last_run_status,
          last_error
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.assistantId,
        input.threadId ?? null,
        input.name,
        input.prompt,
        input.cronExpression,
        input.enabled === false ? 0 : 1,
        input.recurring === false ? 0 : 1,
        input.channelId ?? null,
        input.remoteChatId ?? null,
        input.lastRunAt ?? null,
        input.nextRunAt ?? null,
        input.lastRunStatus ?? null,
        input.lastError ?? null
      ]
    )

    const cronJob = await this.getById(id)
    if (!cronJob) {
      throw new Error('Failed to create cron job')
    }

    return cronJob
  }

  async update(id: string, input: UpdateCronJobInput): Promise<AppCronJob | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    await this.db.execute(
      `
        UPDATE app_cron_jobs
        SET
          assistant_id = ?,
          thread_id = ?,
          name = ?,
          prompt = ?,
          cron_expression = ?,
          enabled = ?,
          recurring = ?,
          channel_id = ?,
          remote_chat_id = ?,
          last_run_at = ?,
          next_run_at = ?,
          last_run_status = ?,
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        input.assistantId ?? existing.assistantId,
        'threadId' in input ? (input.threadId ?? null) : existing.threadId,
        input.name ?? existing.name,
        input.prompt ?? existing.prompt,
        input.cronExpression ?? existing.cronExpression,
        input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
        input.recurring === undefined ? (existing.recurring ? 1 : 0) : input.recurring ? 1 : 0,
        'channelId' in input ? (input.channelId ?? null) : existing.channelId,
        'remoteChatId' in input ? (input.remoteChatId ?? null) : existing.remoteChatId,
        'lastRunAt' in input ? (input.lastRunAt ?? null) : existing.lastRunAt,
        'nextRunAt' in input ? (input.nextRunAt ?? null) : existing.nextRunAt,
        'lastRunStatus' in input ? (input.lastRunStatus ?? null) : existing.lastRunStatus,
        'lastError' in input ? (input.lastError ?? null) : existing.lastError,
        id
      ]
    )

    return this.getById(id)
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id)
    if (!existing) {
      return false
    }

    await this.db.execute('DELETE FROM app_cron_jobs WHERE id = ?', [id])
    return true
  }
}
