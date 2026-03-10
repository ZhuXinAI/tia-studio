import { createApiClient } from '../../../lib/api-client'

export type SecurityProviderOption = {
  id: string
  name: string
  type: string
  selectedModel: string
}

export type SecuritySettings = {
  promptInjectionEnabled: boolean
  piiDetectionEnabled: boolean
  guardrailProviderId: string | null
  availableProviders: SecurityProviderOption[]
}

const apiClient = createApiClient()

export async function getSecuritySettings(): Promise<SecuritySettings> {
  return apiClient.get<SecuritySettings>('/v1/settings/security')
}

export async function updateSecuritySettings(input: {
  promptInjectionEnabled?: boolean
  piiDetectionEnabled?: boolean
  guardrailProviderId?: string | null
}): Promise<SecuritySettings> {
  return apiClient.patch<SecuritySettings>('/v1/settings/security', input)
}
