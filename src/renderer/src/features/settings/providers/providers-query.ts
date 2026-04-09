import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createApiClient } from '../../../lib/api-client'

export type ProviderType =
  | 'acp'
  | 'openai'
  | 'openai-response'
  | 'openrouter'
  | 'gemini'
  | 'anthropic'
  | 'ollama'
  | 'codex-acp'
  | 'claude-agent-acp'

export type ProviderRecord = {
  id: string
  name: string
  type: ProviderType
  apiKey: string
  apiHost: string | null
  selectedModel: string
  providerModels: string[] | null
  enabled: boolean
  supportsVision: boolean
  isBuiltIn: boolean
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
  providerModels?: string[]
  enabled?: boolean
  supportsVision?: boolean
}

type ProviderConnectionTestResult = {
  ok: boolean
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
    providerModels: normalizeProviderModels(input.providerModels) ?? undefined
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
      providerModels: provider.providerModels ?? undefined,
      enabled: provider.enabled
    })
  }

  clearLegacyProviders()
  return true
}

// Legacy functions (kept for backward compatibility during migration)
export async function listProviders(): Promise<ProviderRecord[]> {
  const providers = await apiClient.get<ProviderRecord[]>('/v1/providers')
  const migrated = await migrateLegacyProvidersIfNeeded(providers)
  if (!migrated) {
    return providers
  }

  return apiClient.get<ProviderRecord[]>('/v1/providers')
}

export async function createProvider(input: SaveProviderInput): Promise<ProviderRecord> {
  return apiClient.post<ProviderRecord>('/v1/providers', normalizeSaveInput(input))
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
    providerModels:
      input.providerModels === undefined
        ? undefined
        : (normalizeProviderModels(input.providerModels) ?? undefined)
  }

  return apiClient.patch<ProviderRecord>(`/v1/providers/${providerId}`, normalizedInput)
}

export async function deleteProvider(providerId: string): Promise<void> {
  await apiClient.delete(`/v1/providers/${providerId}`)
}

export async function testProviderConnection(input: SaveProviderInput): Promise<void> {
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
      apiHost: input.apiHost?.trim() || undefined,
      selectedModel: input.selectedModel.trim()
    }
  )

  if (!result.ok) {
    throw new Error(result.error ?? 'Connection check failed')
  }
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
    mutationFn: testProviderConnection
  })
}
