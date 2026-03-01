import { createApiClient } from '../../../lib/api-client'

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

const apiClient = createApiClient()

export async function listProviders(): Promise<ProviderRecord[]> {
  return apiClient.get<ProviderRecord[]>('/v1/providers')
}

export async function createProvider(input: SaveProviderInput): Promise<ProviderRecord> {
  return apiClient.post<ProviderRecord>('/v1/providers', input)
}

export async function updateProvider(
  providerId: string,
  input: Partial<SaveProviderInput>
): Promise<ProviderRecord> {
  return apiClient.patch<ProviderRecord>(`/v1/providers/${providerId}`, input)
}
