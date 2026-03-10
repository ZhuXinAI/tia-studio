import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type HeartbeatRunStatus = 'success' | 'failed'

export type AppAssistantHeartbeat = {
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

export type UpsertAssistantHeartbeatInput = {
  assistantId: string
  enabled: boolean
  intervalMinutes: number
  prompt: string
  threadId?: string | null
  lastRunAt?: string | null
  nextRunAt?: string | null
  lastRunStatus?: HeartbeatRunStatus | null
  lastError?: string | null
}

export type UpdateAssistantHeartbeatInput = Partial<
  Omit<UpsertAssistantHeartbeatInput, 'assistantId'>
>

const ASSISTANT_HEARTBEAT_SELECT = `
  SELECT
    id,
    assistant_id,
    enabled,
    interval_minutes,
    prompt,
    thread_id,
    last_run_at,
    next_run_at,
    last_run_status,
    last_error,
    created_at,
    updated_at
  FROM app_assistant_heartbeats
`

function parseHeartbeatRunStatus(value: unknown): HeartbeatRunStatus | null {
  if (value === 'success' || value === 'failed') {
    return value
  }

  return null
}

function parseAssistantHeartbeatRow(row: Record<string, unknown>): AppAssistantHeartbeat {
  return {
    id: String(row.id),
    assistantId: String(row.assistant_id),
    enabled: Number(row.enabled) === 1,
    intervalMinutes: Number(row.interval_minutes),
    prompt: String(row.prompt),
    threadId: row.thread_id ? String(row.thread_id) : null,
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    lastRunStatus: parseHeartbeatRunStatus(row.last_run_status),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class AssistantHeartbeatsRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppAssistantHeartbeat[]> {
    const result = await this.db.execute(
      `${ASSISTANT_HEARTBEAT_SELECT} ORDER BY created_at DESC, rowid DESC`
    )

    return result.rows.map((row) => parseAssistantHeartbeatRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppAssistantHeartbeat | null> {
    const result = await this.db.execute(`${ASSISTANT_HEARTBEAT_SELECT} WHERE id = ? LIMIT 1`, [id])
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseAssistantHeartbeatRow(row as Record<string, unknown>)
  }

  async getByAssistantId(assistantId: string): Promise<AppAssistantHeartbeat | null> {
    const result = await this.db.execute(
      `${ASSISTANT_HEARTBEAT_SELECT} WHERE assistant_id = ? LIMIT 1`,
      [assistantId]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseAssistantHeartbeatRow(row as Record<string, unknown>)
  }

  async upsertForAssistant(input: UpsertAssistantHeartbeatInput): Promise<AppAssistantHeartbeat> {
    const existing = await this.getByAssistantId(input.assistantId)

    if (existing) {
      const updateInput: UpdateAssistantHeartbeatInput = {
        enabled: input.enabled,
        intervalMinutes: input.intervalMinutes,
        prompt: input.prompt
      }

      if ('threadId' in input) {
        updateInput.threadId = input.threadId ?? null
      }

      if ('lastRunAt' in input) {
        updateInput.lastRunAt = input.lastRunAt ?? null
      }

      if ('nextRunAt' in input) {
        updateInput.nextRunAt = input.nextRunAt ?? null
      }

      if ('lastRunStatus' in input) {
        updateInput.lastRunStatus = input.lastRunStatus ?? null
      }

      if ('lastError' in input) {
        updateInput.lastError = input.lastError ?? null
      }

      const updated = await this.update(existing.id, updateInput)

      if (!updated) {
        throw new Error('Failed to update assistant heartbeat')
      }

      return updated
    }

    const id = randomUUID()
    await this.db.execute(
      `
        INSERT INTO app_assistant_heartbeats (
          id,
          assistant_id,
          enabled,
          interval_minutes,
          prompt,
          thread_id,
          last_run_at,
          next_run_at,
          last_run_status,
          last_error
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.assistantId,
        input.enabled ? 1 : 0,
        input.intervalMinutes,
        input.prompt,
        input.threadId ?? null,
        input.lastRunAt ?? null,
        input.nextRunAt ?? null,
        input.lastRunStatus ?? null,
        input.lastError ?? null
      ]
    )

    const heartbeat = await this.getById(id)
    if (!heartbeat) {
      throw new Error('Failed to create assistant heartbeat')
    }

    return heartbeat
  }

  async update(
    id: string,
    input: UpdateAssistantHeartbeatInput
  ): Promise<AppAssistantHeartbeat | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    await this.db.execute(
      `
        UPDATE app_assistant_heartbeats
        SET
          enabled = ?,
          interval_minutes = ?,
          prompt = ?,
          thread_id = ?,
          last_run_at = ?,
          next_run_at = ?,
          last_run_status = ?,
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
        input.intervalMinutes ?? existing.intervalMinutes,
        input.prompt ?? existing.prompt,
        'threadId' in input ? (input.threadId ?? null) : existing.threadId,
        'lastRunAt' in input ? (input.lastRunAt ?? null) : existing.lastRunAt,
        'nextRunAt' in input ? (input.nextRunAt ?? null) : existing.nextRunAt,
        'lastRunStatus' in input ? (input.lastRunStatus ?? null) : existing.lastRunStatus,
        'lastError' in input ? (input.lastError ?? null) : existing.lastError,
        id
      ]
    )

    return this.getById(id)
  }
}
