import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type AppAssistant = {
  id: string
  name: string
  instructions: string
  providerId: string
  workspaceConfig: Record<string, unknown>
  skillsConfig: Record<string, unknown>
  mcpConfig: Record<string, unknown>
  memoryConfig: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type CreateAssistantInput = {
  name: string
  instructions?: string
  providerId: string
  workspaceConfig?: Record<string, unknown>
  skillsConfig?: Record<string, unknown>
  mcpConfig?: Record<string, unknown>
  memoryConfig?: Record<string, unknown> | null
}

export type UpdateAssistantInput = Partial<CreateAssistantInput>

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {}
  }

  const parsed = JSON.parse(value) as unknown
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }

  return {}
}

function parseAssistantRow(row: Record<string, unknown>): AppAssistant {
  return {
    id: String(row.id),
    name: String(row.name),
    instructions: String(row.instructions),
    providerId: String(row.provider_id),
    workspaceConfig: parseJsonObject(row.workspace_config),
    skillsConfig: parseJsonObject(row.skills_config),
    mcpConfig: parseJsonObject(row.mcp_config),
    memoryConfig: row.memory_config ? parseJsonObject(row.memory_config) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class AssistantsRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppAssistant[]> {
    const result = await this.db.execute(
      'SELECT id, name, instructions, provider_id, workspace_config, skills_config, mcp_config, memory_config, created_at, updated_at FROM app_assistants ORDER BY created_at DESC'
    )

    return result.rows.map((row) => parseAssistantRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppAssistant | null> {
    const result = await this.db.execute(
      'SELECT id, name, instructions, provider_id, workspace_config, skills_config, mcp_config, memory_config, created_at, updated_at FROM app_assistants WHERE id = ? LIMIT 1',
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseAssistantRow(row as Record<string, unknown>)
  }

  async countByProviderId(providerId: string): Promise<number> {
    const result = await this.db.execute(
      'SELECT COUNT(*) AS total FROM app_assistants WHERE provider_id = ?',
      [providerId]
    )
    const row = result.rows.at(0) as Record<string, unknown> | undefined
    if (!row) {
      return 0
    }

    return Number(row.total ?? 0)
  }

  async create(input: CreateAssistantInput): Promise<AppAssistant> {
    const id = randomUUID()
    await this.db.execute(
      'INSERT INTO app_assistants (id, name, instructions, provider_id, workspace_config, skills_config, mcp_config, memory_config) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.name,
        input.instructions ?? '',
        input.providerId,
        JSON.stringify(input.workspaceConfig ?? {}),
        JSON.stringify(input.skillsConfig ?? {}),
        JSON.stringify(input.mcpConfig ?? {}),
        input.memoryConfig ? JSON.stringify(input.memoryConfig) : null
      ]
    )

    const assistant = await this.getById(id)
    if (!assistant) {
      throw new Error('Failed to create assistant')
    }

    return assistant
  }

  async update(id: string, input: UpdateAssistantInput): Promise<AppAssistant | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    await this.db.execute(
      'UPDATE app_assistants SET name = ?, instructions = ?, provider_id = ?, workspace_config = ?, skills_config = ?, mcp_config = ?, memory_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        input.name ?? existing.name,
        input.instructions ?? existing.instructions,
        input.providerId ?? existing.providerId,
        JSON.stringify(input.workspaceConfig ?? existing.workspaceConfig),
        JSON.stringify(input.skillsConfig ?? existing.skillsConfig),
        JSON.stringify(input.mcpConfig ?? existing.mcpConfig),
        input.memoryConfig
          ? JSON.stringify(input.memoryConfig)
          : existing.memoryConfig
            ? JSON.stringify(existing.memoryConfig)
            : null,
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

    await this.db.execute('DELETE FROM app_threads WHERE assistant_id = ?', [id])
    await this.db.execute('DELETE FROM app_assistants WHERE id = ?', [id])
    return true
  }
}
