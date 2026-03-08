import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'
import type { CronJobRunStatus } from './cron-jobs-repo'

export type AppCronJobRun = {
  id: string
  cronJobId: string
  status: CronJobRunStatus
  scheduledFor: string
  startedAt: string
  finishedAt: string | null
  outputText: string | null
  error: Record<string, unknown> | null
  workLogPath: string | null
  createdAt: string
}

export type CreateCronJobRunInput = {
  cronJobId: string
  status: CronJobRunStatus
  scheduledFor: string
  startedAt: string
  finishedAt?: string | null
  outputText?: string | null
  output?: string | null
  error?: Record<string, unknown> | null
  workLogPath?: string | null
}

const CRON_JOB_RUN_SELECT = `
  SELECT
    id,
    cron_job_id,
    status,
    scheduled_for,
    started_at,
    finished_at,
    output_text,
    error,
    work_log_path,
    created_at
  FROM app_cron_job_runs
`

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }

  return null
}

function parseCronJobRunRow(row: Record<string, unknown>): AppCronJobRun {
  return {
    id: String(row.id),
    cronJobId: String(row.cron_job_id),
    status: String(row.status) as CronJobRunStatus,
    scheduledFor: String(row.scheduled_for),
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    outputText: row.output_text ? String(row.output_text) : null,
    error: parseJsonObject(row.error),
    workLogPath: row.work_log_path ? String(row.work_log_path) : null,
    createdAt: String(row.created_at)
  }
}

export class CronJobRunsRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByCronJobId(cronJobId: string): Promise<AppCronJobRun[]> {
    const result = await this.db.execute(
      `
        ${CRON_JOB_RUN_SELECT}
        WHERE cron_job_id = ?
        ORDER BY scheduled_for DESC, started_at DESC, created_at DESC
      `,
      [cronJobId]
    )

    return result.rows.map((row) => parseCronJobRunRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppCronJobRun | null> {
    const result = await this.db.execute(`${CRON_JOB_RUN_SELECT} WHERE id = ? LIMIT 1`, [id])
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseCronJobRunRow(row as Record<string, unknown>)
  }

  async create(input: CreateCronJobRunInput): Promise<AppCronJobRun> {
    const id = randomUUID()

    await this.db.execute(
      `
        INSERT INTO app_cron_job_runs (
          id,
          cron_job_id,
          status,
          scheduled_for,
          started_at,
          finished_at,
          output_text,
          error,
          work_log_path
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.cronJobId,
        input.status,
        input.scheduledFor,
        input.startedAt,
        input.finishedAt ?? null,
        input.outputText ?? input.output ?? null,
        input.error ? JSON.stringify(input.error) : null,
        input.workLogPath ?? null
      ]
    )

    const cronJobRun = await this.getById(id)
    if (!cronJobRun) {
      throw new Error('Failed to create cron job run')
    }

    return cronJobRun
  }
}
