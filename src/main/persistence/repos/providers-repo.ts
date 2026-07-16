import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'
import {
  deriveModelContextWindowTokensByModel,
  inferKnownModelContextWindowTokens,
  normalizeModelContextWindowTokens,
  type ModelContextWindowTokensByModel
} from '../../utils/model-context-windows'

export type ProviderType = 'openai' | 'openai-response' | 'gemini' | 'anthropic' | 'ollama' | string

export type AppProvider = {
  id: string
  name: string
  type: ProviderType
  apiKey: string
  apiHost: string | null
  selectedModel: string
  selectedModelContextWindowTokens: number | null
  modelContextWindowTokensByModel?: ModelContextWindowTokensByModel | null
  providerModels: string[] | null
  enabled: boolean
  supportsVision: boolean
  isBuiltIn: boolean
  isAdded: boolean
  isDefault: boolean
  icon: string | null
  officialSite: string | null
  createdAt: string
  updatedAt: string
}

export type CreateProviderInput = {
  id?: string
  name: string
  type: ProviderType
  apiKey: string
  apiHost?: string | null
  selectedModel: string
  selectedModelContextWindowTokens?: number | null
  providerModels?: string[] | null
  enabled?: boolean
  supportsVision?: boolean
  isBuiltIn?: boolean
  isAdded?: boolean
  isDefault?: boolean
  icon?: string | null
  officialSite?: string | null
}

export type UpdateProviderInput = Partial<CreateProviderInput>

function parseProviderModels(value: unknown): string[] | null {
  if (typeof value !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return null
    }

    const providerModels = parsed
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)

    return providerModels.length > 0 ? providerModels : null
  } catch {
    return null
  }
}

function parseProviderRow(row: Record<string, unknown>): AppProvider {
  const selectedModel = String(row.selected_model)
  const selectedModelContextWindowTokens = normalizeModelContextWindowTokens(
    row.selected_model_context_window_tokens
  )
  const providerModels = parseProviderModels(row.provider_models)

  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type),
    apiKey: String(row.api_key),
    apiHost: row.api_host ? String(row.api_host) : null,
    selectedModel,
    selectedModelContextWindowTokens,
    modelContextWindowTokensByModel: deriveModelContextWindowTokensByModel({
      selectedModel,
      selectedModelContextWindowTokens,
      providerModels
    }),
    providerModels,
    enabled: Number(row.enabled) === 1,
    supportsVision: Number(row.supports_vision) === 1,
    isBuiltIn: Number(row.is_built_in) === 1,
    isAdded: Number(row.is_added) === 1,
    isDefault: Number(row.is_default) === 1,
    icon: row.icon ? String(row.icon) : null,
    officialSite: row.official_site ? String(row.official_site) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class ProvidersRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppProvider[]> {
    const result = await this.db.execute(
      'SELECT id, name, type, api_key, api_host, selected_model, selected_model_context_window_tokens, provider_models, enabled, supports_vision, is_built_in, is_added, is_default, icon, official_site, created_at, updated_at FROM app_providers ORDER BY is_default DESC, is_added DESC, is_built_in DESC, created_at DESC'
    )

    return result.rows.map((row) => parseProviderRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppProvider | null> {
    const result = await this.db.execute(
      'SELECT id, name, type, api_key, api_host, selected_model, selected_model_context_window_tokens, provider_models, enabled, supports_vision, is_built_in, is_added, is_default, icon, official_site, created_at, updated_at FROM app_providers WHERE id = ? LIMIT 1',
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseProviderRow(row as Record<string, unknown>)
  }

  async create(input: CreateProviderInput): Promise<AppProvider> {
    const id = input.id ?? randomUUID()
    const selectedModelContextWindowTokens =
      normalizeModelContextWindowTokens(input.selectedModelContextWindowTokens) ??
      inferKnownModelContextWindowTokens(input.selectedModel)
    const isDefault = input.isDefault === true

    if (isDefault) {
      await this.db.execute('UPDATE app_providers SET is_default = 0 WHERE is_default = 1')
    }

    await this.db.execute(
      'INSERT INTO app_providers (id, name, type, api_key, api_host, selected_model, selected_model_context_window_tokens, provider_models, enabled, supports_vision, is_built_in, is_added, is_default, icon, official_site) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.name,
        input.type,
        input.apiKey,
        input.apiHost ?? null,
        input.selectedModel,
        selectedModelContextWindowTokens,
        input.providerModels ? JSON.stringify(input.providerModels) : null,
        input.enabled === false ? 0 : 1,
        input.supportsVision === true ? 1 : 0,
        input.isBuiltIn === true ? 1 : 0,
        input.isAdded === false ? 0 : 1,
        isDefault ? 1 : 0,
        input.icon ?? null,
        input.officialSite ?? null
      ]
    )

    const provider = await this.getById(id)
    if (!provider) {
      throw new Error('Failed to create provider')
    }

    return provider
  }

  async update(id: string, input: UpdateProviderInput): Promise<AppProvider | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    const nextSelectedModel = input.selectedModel ?? existing.selectedModel
    const modelSelectionChanged = input.selectedModel !== undefined || input.type !== undefined
    const selectedModelContextWindowTokens =
      input.selectedModelContextWindowTokens !== undefined
        ? normalizeModelContextWindowTokens(input.selectedModelContextWindowTokens)
        : (inferKnownModelContextWindowTokens(nextSelectedModel) ??
          (modelSelectionChanged ? null : existing.selectedModelContextWindowTokens))
    const nextIsDefault = input.isDefault === undefined ? existing.isDefault : input.isDefault

    if (nextIsDefault) {
      await this.db.execute('UPDATE app_providers SET is_default = 0 WHERE id <> ?', [id])
    }

    await this.db.execute(
      'UPDATE app_providers SET name = ?, type = ?, api_key = ?, api_host = ?, selected_model = ?, selected_model_context_window_tokens = ?, provider_models = ?, enabled = ?, supports_vision = ?, is_added = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        input.name ?? existing.name,
        input.type ?? existing.type,
        input.apiKey ?? existing.apiKey,
        input.apiHost ?? existing.apiHost,
        nextSelectedModel,
        selectedModelContextWindowTokens,
        input.providerModels
          ? JSON.stringify(input.providerModels)
          : existing.providerModels
            ? JSON.stringify(existing.providerModels)
            : null,
        input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
        input.supportsVision === undefined
          ? existing.supportsVision
            ? 1
            : 0
          : input.supportsVision
            ? 1
            : 0,
        input.isAdded === undefined ? (existing.isAdded ? 1 : 0) : input.isAdded ? 1 : 0,
        nextIsDefault ? 1 : 0,
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

    if (existing.isBuiltIn) {
      await this.db.execute(
        'UPDATE app_providers SET enabled = 0, is_added = 0, is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      )
      return true
    }

    await this.db.execute('DELETE FROM app_providers WHERE id = ?', [id])
    return true
  }
}
