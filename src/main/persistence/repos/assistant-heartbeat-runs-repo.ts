import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'
import type { HeartbeatRunStatus } from './assistant-heartbeats-repo'

export type AppAssistantHeartbeatRun = {
  id: string
  heartbeatId: string
  status: HeartbeatRunStatus
  scheduledFor: string
  startedAt: string
  finishedAt: string | null
  outputText: string | null
  error: Record<string, unknown> | null
  workLogPath: string | null
  createdAt: string
}

export type CreateAssistantHeartbeatRunInput = {
  heartbeatId: string
  status: HeartbeatRunStatus
  scheduledFor: string
  startedAt: string
  finishedAt?: string | null
  outputText?: string | null
  output?: string | null
  error?: Record<string, unknown> | null
  workLogPath?: string | null
}

const ASSISTANT_HEARTBEAT_RUN_SELECT = `
  SELECT
    id,
    heartbeat_id,
    status,
    scheduled_for,
    started_at,
    finished_at,
    output_text,
    error,
    work_log_path,
    created_at
  FROM app_assistant_heartbeat_runs
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

function parseAssistantHeartbeatRunRow(row: Record<string, unknown>): AppAssistantHeartbeatRun {
  return {
    id: String(row.id),
    heartbeatId: String(row.heartbeat_id),
    status: String(row.status) as HeartbeatRunStatus,
    scheduledFor: String(row.scheduled_for),
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    outputText: row.output_text ? String(row.output_text) : null,
    error: parseJsonObject(row.error),
    workLogPath: row.work_log_path ? String(row.work_log_path) : null,
    createdAt: String(row.created_at)
  }
}

export class AssistantHeartbeatRunsRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByHeartbeatId(heartbeatId: string): Promise<AppAssistantHeartbeatRun[]> {
    const result = await this.db.execute(
      `
        ${ASSISTANT_HEARTBEAT_RUN_SELECT}
        WHERE heartbeat_id = ?
        ORDER BY scheduled_for DESC, started_at DESC, created_at DESC
      `,
      [heartbeatId]
    )

    return result.rows.map((row) => parseAssistantHeartbeatRunRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppAssistantHeartbeatRun | null> {
    const result = await this.db.execute(`${ASSISTANT_HEARTBEAT_RUN_SELECT} WHERE id = ? LIMIT 1`, [
      id
    ])
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseAssistantHeartbeatRunRow(row as Record<string, unknown>)
  }

  async create(input: CreateAssistantHeartbeatRunInput): Promise<AppAssistantHeartbeatRun> {
    const id = randomUUID()

    await this.db.execute(
      `
        INSERT INTO app_assistant_heartbeat_runs (
          id,
          heartbeat_id,
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
        input.heartbeatId,
        input.status,
        input.scheduledFor,
        input.startedAt,
        input.finishedAt ?? null,
        input.outputText ?? input.output ?? null,
        input.error ? JSON.stringify(input.error) : null,
        input.workLogPath ?? null
      ]
    )

    const heartbeatRun = await this.getById(id)
    if (!heartbeatRun) {
      throw new Error('Failed to create assistant heartbeat run')
    }

    return heartbeatRun
  }
}
