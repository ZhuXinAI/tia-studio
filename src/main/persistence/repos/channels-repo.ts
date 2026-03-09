import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type ChannelType = 'lark' | string

export type AppChannel = {
  id: string
  type: ChannelType
  name: string
  assistantId: string | null
  enabled: boolean
  config: Record<string, unknown>
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type CreateChannelInput = {
  type: ChannelType
  name: string
  assistantId?: string | null
  enabled?: boolean
  config?: Record<string, unknown>
  lastError?: string | null
}

export type UpdateChannelInput = Partial<CreateChannelInput>

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as unknown

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

function parseChannelRow(row: Record<string, unknown>): AppChannel {
  return {
    id: String(row.id),
    type: String(row.type),
    name: String(row.name),
    assistantId: row.assistant_id ? String(row.assistant_id) : null,
    enabled: Number(row.enabled) === 1,
    config: parseJsonObject(row.config),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

const CHANNEL_COLUMNS = `
  app_channels.id AS id,
  app_channels.type AS type,
  app_channels.name AS name,
  app_channels.assistant_id AS assistant_id,
  app_channels.enabled AS enabled,
  app_channels.config AS config,
  app_channels.last_error AS last_error,
  app_channels.created_at AS created_at,
  app_channels.updated_at AS updated_at
`

const CHANNEL_SELECT = `
  SELECT ${CHANNEL_COLUMNS}
  FROM app_channels
`

export class ChannelsRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppChannel[]> {
    const result = await this.db.execute(`${CHANNEL_SELECT} ORDER BY created_at DESC`)

    return result.rows.map((row) => parseChannelRow(row as Record<string, unknown>))
  }

  async listEnabled(): Promise<AppChannel[]> {
    const result = await this.db.execute(
      `${CHANNEL_SELECT} WHERE enabled = 1 ORDER BY created_at DESC`
    )

    return result.rows.map((row) => parseChannelRow(row as Record<string, unknown>))
  }

  async listRuntimeEnabled(): Promise<AppChannel[]> {
    const result = await this.db.execute(
      `
        ${CHANNEL_SELECT}
        INNER JOIN app_assistants ON app_assistants.id = app_channels.assistant_id
        WHERE app_channels.enabled = 1
          AND app_channels.assistant_id IS NOT NULL
          AND app_assistants.enabled = 1
        ORDER BY app_channels.created_at DESC
      `
    )

    return result.rows.map((row) => parseChannelRow(row as Record<string, unknown>))
  }

  async listUnbound(): Promise<AppChannel[]> {
    const result = await this.db.execute(
      `${CHANNEL_SELECT} WHERE assistant_id IS NULL ORDER BY created_at DESC`
    )

    return result.rows.map((row) => parseChannelRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppChannel | null> {
    const result = await this.db.execute(`${CHANNEL_SELECT} WHERE id = ? LIMIT 1`, [id])
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseChannelRow(row as Record<string, unknown>)
  }

  async getRuntimeById(id: string): Promise<AppChannel | null> {
    const result = await this.db.execute(
      `
        ${CHANNEL_SELECT}
        INNER JOIN app_assistants ON app_assistants.id = app_channels.assistant_id
        WHERE app_channels.id = ?
          AND app_channels.enabled = 1
          AND app_channels.assistant_id IS NOT NULL
          AND app_assistants.enabled = 1
        LIMIT 1
      `,
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseChannelRow(row as Record<string, unknown>)
  }

  async getByType(type: ChannelType): Promise<AppChannel[]> {
    const result = await this.db.execute(
      `${CHANNEL_SELECT} WHERE type = ? ORDER BY created_at DESC`,
      [type]
    )

    return result.rows.map((row) => parseChannelRow(row as Record<string, unknown>))
  }

  async getByAssistantId(assistantId: string): Promise<AppChannel | null> {
    const result = await this.db.execute(
      `${CHANNEL_SELECT} WHERE assistant_id = ? ORDER BY created_at DESC LIMIT 1`,
      [assistantId]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseChannelRow(row as Record<string, unknown>)
  }

  async create(input: CreateChannelInput): Promise<AppChannel> {
    const id = randomUUID()

    await this.db.execute(
      `
        INSERT INTO app_channels (id, type, name, assistant_id, enabled, config, last_error)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.type,
        input.name,
        input.assistantId ?? null,
        input.enabled === false ? 0 : 1,
        JSON.stringify(input.config ?? {}),
        input.lastError ?? null
      ]
    )

    const channel = await this.getById(id)
    if (!channel) {
      throw new Error('Failed to create channel')
    }

    return channel
  }

  async update(id: string, input: UpdateChannelInput): Promise<AppChannel | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    const assistantId = 'assistantId' in input ? (input.assistantId ?? null) : existing.assistantId
    const lastError = 'lastError' in input ? (input.lastError ?? null) : existing.lastError

    await this.db.execute(
      `
        UPDATE app_channels
        SET
          type = ?,
          name = ?,
          assistant_id = ?,
          enabled = ?,
          config = ?,
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        input.type ?? existing.type,
        input.name ?? existing.name,
        assistantId,
        input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
        JSON.stringify('config' in input ? (input.config ?? {}) : existing.config),
        lastError,
        id
      ]
    )

    return this.getById(id)
  }

  async setLastError(id: string, message: string | null): Promise<AppChannel | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    await this.db.execute(
      `
        UPDATE app_channels
        SET
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [message, id]
    )

    return this.getById(id)
  }

  async clearLastError(id: string): Promise<AppChannel | null> {
    return this.setLastError(id, null)
  }
}
