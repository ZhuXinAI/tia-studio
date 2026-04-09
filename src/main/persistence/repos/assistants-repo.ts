import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

const DEFAULT_ASSISTANT_MAX_STEPS = 100
const BUILT_IN_DEFAULT_AGENT_MCP_KEY = '__tiaBuiltInDefaultAgent'

export const assistantOrigins = ['tia', 'external-acp', 'built-in'] as const
export type AssistantOrigin = (typeof assistantOrigins)[number]

export type AppAssistant = {
  id: string
  name: string
  description: string
  instructions: string
  enabled: boolean
  origin: AssistantOrigin
  studioFeaturesEnabled: boolean
  providerId: string | null
  workspaceConfig: Record<string, unknown>
  skillsConfig: Record<string, unknown>
  mcpConfig: Record<string, boolean>
  maxSteps: number
  memoryConfig: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type CreateAssistantInput = {
  name: string
  description?: string
  instructions?: string
  enabled?: boolean
  origin?: AssistantOrigin
  studioFeaturesEnabled?: boolean
  providerId: string | null
  workspaceConfig?: Record<string, unknown>
  skillsConfig?: Record<string, unknown>
  mcpConfig?: Record<string, boolean>
  maxSteps?: number
  memoryConfig?: Record<string, unknown> | null
}

export type UpdateAssistantInput = Partial<CreateAssistantInput>

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeWorkspaceConfig(
  workspaceConfig: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const normalizedConfig = { ...(workspaceConfig ?? {}) }
  const rootPath =
    toNonEmptyString(normalizedConfig.rootPath) ?? toNonEmptyString(normalizedConfig.path)

  delete normalizedConfig.path

  if (rootPath) {
    normalizedConfig.rootPath = rootPath
  } else {
    delete normalizedConfig.rootPath
  }

  return normalizedConfig
}

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

function parseJsonBooleanMap(value: unknown): Record<string, boolean> {
  const parsedObject = parseJsonObject(value)
  const entries = Object.entries(parsedObject)
    .map(([key, rawValue]) => {
      const normalizedKey = key.trim()
      if (normalizedKey.length === 0) {
        return null
      }

      if (typeof rawValue === 'boolean') {
        return [normalizedKey, rawValue] as const
      }

      if (typeof rawValue === 'number') {
        return [normalizedKey, rawValue !== 0] as const
      }

      if (typeof rawValue === 'string') {
        const normalizedValue = rawValue.trim().toLowerCase()
        if (normalizedValue === 'true' || normalizedValue === '1') {
          return [normalizedKey, true] as const
        }

        if (normalizedValue === 'false' || normalizedValue === '0') {
          return [normalizedKey, false] as const
        }
      }

      return null
    })
    .filter((entry): entry is readonly [string, boolean] => entry !== null)

  return Object.fromEntries(entries)
}

function parseAssistantOrigin(
  value: unknown,
  mcpConfig: Record<string, boolean>
): AssistantOrigin {
  if (mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] === true) {
    return 'built-in'
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim()
    if (normalizedValue === 'tia' || normalizedValue === 'external-acp' || normalizedValue === 'built-in') {
      return normalizedValue
    }
  }

  return 'tia'
}

function parseBooleanWithDefault(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase()
    if (normalizedValue === '1' || normalizedValue === 'true') {
      return true
    }

    if (normalizedValue === '0' || normalizedValue === 'false') {
      return false
    }
  }

  return defaultValue
}

function parseAssistantRow(row: Record<string, unknown>): AppAssistant {
  const parsedMaxSteps = Number(row.max_steps)
  const maxSteps =
    Number.isInteger(parsedMaxSteps) && parsedMaxSteps > 0
      ? parsedMaxSteps
      : DEFAULT_ASSISTANT_MAX_STEPS
  const mcpConfig = parseJsonBooleanMap(row.mcp_config)
  const origin = parseAssistantOrigin(row.origin, mcpConfig)

  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    instructions: String(row.instructions),
    enabled: Number(row.enabled) === 1,
    origin,
    studioFeaturesEnabled: parseBooleanWithDefault(row.studio_features_enabled, true),
    providerId: String(row.provider_id),
    workspaceConfig: normalizeWorkspaceConfig(parseJsonObject(row.workspace_config)),
    skillsConfig: parseJsonObject(row.skills_config),
    mcpConfig,
    maxSteps,
    memoryConfig: row.memory_config ? parseJsonObject(row.memory_config) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class AssistantsRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppAssistant[]> {
    const result = await this.db.execute(
      'SELECT id, name, description, instructions, enabled, origin, studio_features_enabled, provider_id, workspace_config, skills_config, mcp_config, max_steps, memory_config, created_at, updated_at FROM app_assistants ORDER BY created_at DESC'
    )

    return result.rows.map((row) => parseAssistantRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppAssistant | null> {
    const result = await this.db.execute(
      'SELECT id, name, description, instructions, enabled, origin, studio_features_enabled, provider_id, workspace_config, skills_config, mcp_config, max_steps, memory_config, created_at, updated_at FROM app_assistants WHERE id = ? LIMIT 1',
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
    const workspaceConfig = normalizeWorkspaceConfig(input.workspaceConfig)
    const mcpConfig = input.mcpConfig ?? {}
    const origin = parseAssistantOrigin(input.origin, mcpConfig)
    await this.db.execute(
      'INSERT INTO app_assistants (id, name, description, instructions, enabled, origin, studio_features_enabled, provider_id, workspace_config, skills_config, mcp_config, max_steps, memory_config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.name,
        input.description ?? '',
        input.instructions ?? '',
        input.enabled === true ? 1 : 0,
        origin,
        input.studioFeaturesEnabled === false ? 0 : 1,
        input.providerId,
        JSON.stringify(workspaceConfig),
        JSON.stringify(input.skillsConfig ?? {}),
        JSON.stringify(mcpConfig),
        input.maxSteps ?? DEFAULT_ASSISTANT_MAX_STEPS,
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

    const workspaceConfig = normalizeWorkspaceConfig(
      input.workspaceConfig ?? existing.workspaceConfig
    )
    const mcpConfig = input.mcpConfig ?? existing.mcpConfig
    const origin = parseAssistantOrigin(input.origin ?? existing.origin, mcpConfig)

    await this.db.execute(
      'UPDATE app_assistants SET name = ?, description = ?, instructions = ?, enabled = ?, origin = ?, studio_features_enabled = ?, provider_id = ?, workspace_config = ?, skills_config = ?, mcp_config = ?, max_steps = ?, memory_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        input.name ?? existing.name,
        input.description ?? existing.description,
        input.instructions ?? existing.instructions,
        input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
        origin,
        input.studioFeaturesEnabled === undefined
          ? existing.studioFeaturesEnabled
            ? 1
            : 0
          : input.studioFeaturesEnabled
            ? 1
            : 0,
        input.providerId ?? existing.providerId,
        JSON.stringify(workspaceConfig),
        JSON.stringify(input.skillsConfig ?? existing.skillsConfig),
        JSON.stringify(mcpConfig),
        input.maxSteps ?? existing.maxSteps,
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
