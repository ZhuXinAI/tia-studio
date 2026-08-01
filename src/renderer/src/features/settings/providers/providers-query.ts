import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createApiClient } from '../../../lib/api-client'
import type { AgentThinkingLevel } from '../../../../../shared/agent-runtime'
import {
  defaultThinkingLevelForModel,
  defaultThinkingStrengthsForModel,
  normalizeThinkingLevelForProvider,
  type AgentThinkingStrength
} from '../../../../../shared/thinking'

export type ProviderType =
  | 'openai'
  | 'openai-response'
  | 'openrouter'
  | 'gemini'
  | 'anthropic'
  | 'ollama'

export type ProviderRecord = {
  id: string
  name: string
  type: ProviderType
  apiKey: string
  hasApiKey?: boolean
  apiHost: string | null
  selectedModel: string
  selectedModelContextWindowTokens?: number | null
  modelContextWindowTokensByModel?: Record<string, number> | null
  providerModels: string[] | null
  enabled: boolean
  supportsVision: boolean
  supportsThinking: boolean
  thinkingOnly: boolean
  allowsThinkingOff: boolean
  defaultThinkingLevel: AgentThinkingLevel
  supportedThinkingLevels: AgentThinkingStrength[]
  isBuiltIn: boolean
  isAdded?: boolean
  isDefault?: boolean
  icon: string | null
  officialSite: string | null
  createdAt: string
  updatedAt: string
}

export type SaveProviderInput = {
  name: string
  type: ProviderType
  apiKey: string
  apiHost?: string
  selectedModel: string
  selectedModelContextWindowTokens?: number | null
  providerModels?: string[]
  enabled?: boolean
  supportsVision?: boolean
  supportsThinking?: boolean
  thinkingOnly?: boolean
  allowsThinkingOff?: boolean
  defaultThinkingLevel?: AgentThinkingLevel
  supportedThinkingLevels?: AgentThinkingStrength[]
  isAdded?: boolean
  isDefault?: boolean
}

export type ProviderConnectionTestResult = {
  ok: boolean
  reply?: string
  error?: string
}

const apiClient = createApiClient()
const legacyProvidersStorageKey = 'tia.providers.v1'
export const providerConnectionEventName = 'tia:provider:test-connection'

// Query keys for cache management
export const providerKeys = {
  all: ['providers'] as const,
  lists: () => [...providerKeys.all, 'list'] as const,
  detail: (id: string) => [...providerKeys.all, 'detail', id] as const
}

function normalizeProviderModels(providerModels?: string[]): string[] | null {
  if (!providerModels || providerModels.length === 0) {
    return null
  }

  return providerModels.map((model) => model.trim()).filter((model) => model.length > 0)
}

function normalizeSaveInput(input: SaveProviderInput): SaveProviderInput {
  return {
    ...input,
    name: input.name.trim(),
    apiHost: input.apiHost?.trim() || undefined,
    selectedModel: input.selectedModel.trim(),
    selectedModelContextWindowTokens:
      typeof input.selectedModelContextWindowTokens === 'number' &&
      Number.isFinite(input.selectedModelContextWindowTokens) &&
      input.selectedModelContextWindowTokens > 0
        ? Math.round(input.selectedModelContextWindowTokens)
        : undefined,
    providerModels: normalizeProviderModels(input.providerModels) ?? undefined
  }
}

function normalizeProviderRecord(provider: ProviderRecord): ProviderRecord {
  const supportsThinking = provider.supportsThinking !== false
  const thinkingOnly = supportsThinking && provider.thinkingOnly === true
  const allowsThinkingOff =
    supportsThinking && !thinkingOnly && provider.allowsThinkingOff !== false
  const supportedThinkingLevels =
    provider.supportedThinkingLevels?.length > 0
      ? provider.supportedThinkingLevels
      : defaultThinkingStrengthsForModel(provider.selectedModel)

  return {
    ...provider,
    supportsThinking,
    thinkingOnly,
    allowsThinkingOff,
    supportedThinkingLevels,
    defaultThinkingLevel: normalizeThinkingLevelForProvider({
      modelId: provider.selectedModel,
      supportsThinking,
      thinkingOnly,
      allowsThinkingOff,
      defaultThinkingLevel:
        provider.defaultThinkingLevel ?? defaultThinkingLevelForModel(provider.selectedModel),
      supportedThinkingLevels
    })
  }
}

function readLegacyProviders(): ProviderRecord[] {
  const rawValue = window.localStorage.getItem(legacyProvidersStorageKey)
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed as ProviderRecord[]
  } catch {
    return []
  }
}

function clearLegacyProviders(): void {
  window.localStorage.removeItem(legacyProvidersStorageKey)
}

async function migrateLegacyProvidersIfNeeded(
  existingProviders: ProviderRecord[]
): Promise<boolean> {
  if (existingProviders.length > 0) {
    return false
  }

  const legacyProviders = readLegacyProviders()
  if (legacyProviders.length === 0) {
    return false
  }

  for (const provider of legacyProviders) {
    await apiClient.post<ProviderRecord>('/v1/providers', {
      name: provider.name,
      type: provider.type,
      apiKey: provider.apiKey,
      apiHost: provider.apiHost ?? undefined,
      selectedModel: provider.selectedModel,
      selectedModelContextWindowTokens: provider.selectedModelContextWindowTokens ?? undefined,
      providerModels: provider.providerModels ?? undefined,
      enabled: provider.enabled,
      supportsThinking: provider.supportsThinking,
      thinkingOnly: provider.thinkingOnly,
      allowsThinkingOff: provider.allowsThinkingOff,
      defaultThinkingLevel: provider.defaultThinkingLevel,
      supportedThinkingLevels: provider.supportedThinkingLevels
    })
  }

  clearLegacyProviders()
  return true
}

// Legacy functions (kept for backward compatibility during migration)
export async function listProviders(): Promise<ProviderRecord[]> {
  const providers = (await apiClient.get<ProviderRecord[]>('/v1/providers')).map(
    normalizeProviderRecord
  )
  const migrated = await migrateLegacyProvidersIfNeeded(providers)
  if (!migrated) {
    return providers
  }

  return (await apiClient.get<ProviderRecord[]>('/v1/providers')).map(normalizeProviderRecord)
}

export async function createProvider(input: SaveProviderInput): Promise<ProviderRecord> {
  return normalizeProviderRecord(
    await apiClient.post<ProviderRecord>('/v1/providers', normalizeSaveInput(input))
  )
}

export async function updateProvider(
  providerId: string,
  input: Partial<SaveProviderInput>
): Promise<ProviderRecord> {
  const normalizedInput: Partial<SaveProviderInput> = {
    ...input,
    name: input.name?.trim(),
    apiHost: input.apiHost?.trim() || input.apiHost,
    selectedModel: input.selectedModel?.trim(),
    selectedModelContextWindowTokens:
      input.selectedModelContextWindowTokens === undefined
        ? undefined
        : typeof input.selectedModelContextWindowTokens === 'number' &&
            Number.isFinite(input.selectedModelContextWindowTokens) &&
            input.selectedModelContextWindowTokens > 0
          ? Math.round(input.selectedModelContextWindowTokens)
          : null,
    providerModels:
      input.providerModels === undefined
        ? undefined
        : (normalizeProviderModels(input.providerModels) ?? []),
    supportedThinkingLevels:
      input.supportedThinkingLevels === undefined
        ? undefined
        : Array.from(new Set(input.supportedThinkingLevels))
  }

  return normalizeProviderRecord(
    await apiClient.patch<ProviderRecord>(`/v1/providers/${providerId}`, normalizedInput)
  )
}

export async function deleteProvider(providerId: string): Promise<void> {
  await apiClient.delete(`/v1/providers/${providerId}`)
}

export async function testProviderConnection(
  input: SaveProviderInput,
  providerId?: string
): Promise<ProviderConnectionTestResult> {
  window.dispatchEvent(
    new CustomEvent(providerConnectionEventName, {
      detail: {
        name: input.name,
        type: input.type,
        apiHost: input.apiHost ?? null,
        selectedModel: input.selectedModel
      }
    })
  )

  const result = await apiClient.post<ProviderConnectionTestResult>(
    '/v1/providers/test-connection',
    {
      type: input.type,
      apiKey: input.apiKey,
      providerId,
      apiHost: input.apiHost?.trim() || undefined,
      selectedModel: input.selectedModel.trim()
    }
  )

  if (!result.ok) {
    throw new Error(result.error ?? 'Connection check failed')
  }

  return result
}

// TanStack Query hooks
export function useProviders() {
  return useQuery({
    queryKey: providerKeys.lists(),
    queryFn: listProviders
  })
}

export function useCreateProvider() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
    }
  })
}

export function useUpdateProvider() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SaveProviderInput> }) =>
      updateProvider(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
    }
  })
}

export function useDeleteProvider() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
    }
  })
}

export function useTestProviderConnection() {
  return useMutation({
    mutationFn: (input: SaveProviderInput) => testProviderConnection(input)
  })
}
