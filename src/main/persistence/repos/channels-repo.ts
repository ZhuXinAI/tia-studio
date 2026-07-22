import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type ChannelType = 'lark' | string
export type AppChannel = {
  id: string
  type: ChannelType
  name: string
  enabled: boolean
  workspaceId: string | null
  config: Record<string, unknown>
  lastError: string | null
  createdAt: string
  updatedAt: string
}
export type CreateChannelInput = {
  type: ChannelType
  name: string
  enabled?: boolean
  workspaceId?: string | null
  config?: Record<string, unknown>
  lastError?: string | null
}
export type UpdateChannelInput = Partial<CreateChannelInput>

function parseConfig(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function parseChannel(row: Record<string, unknown>): AppChannel {
  return {
    id: String(row.id),
    type: String(row.type),
    name: String(row.name),
    enabled: Number(row.enabled) === 1,
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    config: parseConfig(row.config),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

const SELECT =
  'SELECT id, type, name, enabled, workspace_id, config, last_error, created_at, updated_at FROM app_channels'

export class ChannelsRepository {
  constructor(private readonly db: AppDatabase) {}
  async list(): Promise<AppChannel[]> {
    const result = await this.db.execute(`${SELECT} ORDER BY created_at DESC`)
    return result.rows.map((row) => parseChannel(row as Record<string, unknown>))
  }
  async listEnabled(): Promise<AppChannel[]> {
    const result = await this.db.execute(`${SELECT} WHERE enabled = 1 ORDER BY created_at DESC`)
    return result.rows.map((row) => parseChannel(row as Record<string, unknown>))
  }
  async listRuntimeEnabled(): Promise<AppChannel[]> {
    return this.listEnabled()
  }
  async getById(id: string): Promise<AppChannel | null> {
    const result = await this.db.execute(`${SELECT} WHERE id = ? LIMIT 1`, [id])
    const row = result.rows.at(0)
    return row ? parseChannel(row as Record<string, unknown>) : null
  }
  async getRuntimeById(id: string): Promise<AppChannel | null> {
    const channel = await this.getById(id)
    return channel?.enabled ? channel : null
  }
  async getByType(type: ChannelType): Promise<AppChannel[]> {
    const result = await this.db.execute(`${SELECT} WHERE type = ? ORDER BY created_at DESC`, [
      type
    ])
    return result.rows.map((row) => parseChannel(row as Record<string, unknown>))
  }
  async create(input: CreateChannelInput): Promise<AppChannel> {
    const id = randomUUID()
    await this.db.execute(
      'INSERT INTO app_channels (id, type, name, enabled, workspace_id, config, last_error) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.type,
        input.name,
        input.enabled === false ? 0 : 1,
        input.workspaceId ?? null,
        JSON.stringify(input.config ?? {}),
        input.lastError ?? null
      ]
    )
    const created = await this.getById(id)
    if (!created) throw new Error('Failed to create channel')
    return created
  }
  async update(id: string, input: UpdateChannelInput): Promise<AppChannel | null> {
    const existing = await this.getById(id)
    if (!existing) return null
    await this.db.execute(
      'UPDATE app_channels SET type = ?, name = ?, enabled = ?, workspace_id = ?, config = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        input.type ?? existing.type,
        input.name ?? existing.name,
        input.enabled === undefined ? Number(existing.enabled) : Number(input.enabled),
        'workspaceId' in input ? (input.workspaceId ?? null) : existing.workspaceId,
        JSON.stringify(input.config ?? existing.config),
        'lastError' in input ? (input.lastError ?? null) : existing.lastError,
        id
      ]
    )
    return this.getById(id)
  }
  async delete(id: string): Promise<boolean> {
    if (!(await this.getById(id))) return false
    await this.db.execute('DELETE FROM app_channels WHERE id = ?', [id])
    return true
  }
  async setLastError(id: string, message: string | null): Promise<AppChannel | null> {
    return this.update(id, { lastError: message })
  }
  async clearLastError(id: string): Promise<AppChannel | null> {
    return this.setLastError(id, null)
  }
}
