import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type ProviderType =
  | 'openai'
  | 'openai-response'
  | 'gemini'
  | 'anthropic'
  | 'ollama'
  | string

export type AppProvider = {
  id: string
  name: string
  type: ProviderType
  apiKey: string
  apiHost: string | null
  selectedModel: string
  providerModels: string[] | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type CreateProviderInput = {
  name: string
  type: ProviderType
  apiKey: string
  apiHost?: string | null
  selectedModel: string
  providerModels?: string[] | null
  enabled?: boolean
}

export type UpdateProviderInput = Partial<CreateProviderInput>

function parseProviderRow(row: Record<string, unknown>): AppProvider {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type),
    apiKey: String(row.api_key),
    apiHost: row.api_host ? String(row.api_host) : null,
    selectedModel: String(row.selected_model),
    providerModels:
      typeof row.provider_models === 'string'
        ? (JSON.parse(row.provider_models) as string[])
        : null,
    enabled: Number(row.enabled) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class ProvidersRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppProvider[]> {
    const result = await this.db.execute(
      'SELECT id, name, type, api_key, api_host, selected_model, provider_models, enabled, created_at, updated_at FROM app_providers ORDER BY created_at DESC'
    )

    return result.rows.map((row) => parseProviderRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppProvider | null> {
    const result = await this.db.execute(
      'SELECT id, name, type, api_key, api_host, selected_model, provider_models, enabled, created_at, updated_at FROM app_providers WHERE id = ? LIMIT 1',
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseProviderRow(row as Record<string, unknown>)
  }

  async create(input: CreateProviderInput): Promise<AppProvider> {
    const id = randomUUID()
    await this.db.execute(
      'INSERT INTO app_providers (id, name, type, api_key, api_host, selected_model, provider_models, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.name,
        input.type,
        input.apiKey,
        input.apiHost ?? null,
        input.selectedModel,
        input.providerModels ? JSON.stringify(input.providerModels) : null,
        input.enabled === false ? 0 : 1
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

    await this.db.execute(
      'UPDATE app_providers SET name = ?, type = ?, api_key = ?, api_host = ?, selected_model = ?, provider_models = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        input.name ?? existing.name,
        input.type ?? existing.type,
        input.apiKey ?? existing.apiKey,
        input.apiHost ?? existing.apiHost,
        input.selectedModel ?? existing.selectedModel,
        input.providerModels
          ? JSON.stringify(input.providerModels)
          : existing.providerModels
            ? JSON.stringify(existing.providerModels)
            : null,
        input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
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

    await this.db.execute('DELETE FROM app_providers WHERE id = ?', [id])
    return true
  }
}
