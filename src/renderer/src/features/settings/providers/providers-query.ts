export type ProviderType = 'openai' | 'openai-response' | 'gemini' | 'anthropic' | 'ollama'

export type ProviderRecord = {
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

export type SaveProviderInput = {
  name: string
  type: ProviderType
  apiKey: string
  apiHost?: string
  selectedModel: string
  providerModels?: string[]
  enabled?: boolean
}

const providersStorageKey = 'tia.providers.v1'
export const providerConnectionEventName = 'tia:provider:test-connection'

function createProviderId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `provider_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function readProviders(): ProviderRecord[] {
  const rawValue = window.localStorage.getItem(providersStorageKey)
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

function writeProviders(providers: ProviderRecord[]): void {
  window.localStorage.setItem(providersStorageKey, JSON.stringify(providers))
}

function normalizeProviderModels(providerModels?: string[]): string[] | null {
  if (!providerModels || providerModels.length === 0) {
    return null
  }

  return providerModels
    .map((model) => model.trim())
    .filter((model) => model.length > 0)
}

export async function listProviders(): Promise<ProviderRecord[]> {
  return readProviders()
}

export async function createProvider(input: SaveProviderInput): Promise<ProviderRecord> {
  const now = new Date().toISOString()
  const provider: ProviderRecord = {
    id: createProviderId(),
    name: input.name,
    type: input.type,
    apiKey: input.apiKey,
    apiHost: input.apiHost?.trim() || null,
    selectedModel: input.selectedModel.trim(),
    providerModels: normalizeProviderModels(input.providerModels),
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now
  }

  const providers = readProviders()
  providers.unshift(provider)
  writeProviders(providers)

  return provider
}

export async function updateProvider(
  providerId: string,
  input: Partial<SaveProviderInput>
): Promise<ProviderRecord> {
  const providers = readProviders()
  const providerIndex = providers.findIndex((provider) => provider.id === providerId)

  if (providerIndex === -1) {
    throw new Error('Provider not found')
  }

  const currentProvider = providers[providerIndex]
  const nextProvider: ProviderRecord = {
    ...currentProvider,
    name: input.name ?? currentProvider.name,
    type: input.type ?? currentProvider.type,
    apiKey: input.apiKey ?? currentProvider.apiKey,
    apiHost: input.apiHost === undefined ? currentProvider.apiHost : input.apiHost || null,
    selectedModel: input.selectedModel?.trim() || currentProvider.selectedModel,
    providerModels:
      input.providerModels === undefined
        ? currentProvider.providerModels
        : normalizeProviderModels(input.providerModels),
    enabled: input.enabled ?? currentProvider.enabled,
    updatedAt: new Date().toISOString()
  }

  providers.splice(providerIndex, 1, nextProvider)
  writeProviders(providers)

  return nextProvider
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
}
