import { createApiClient } from '../../lib/api-client'

export type RendererUiConfig = {
  transparent?: boolean
  language?: string | null
}

const apiClient = createApiClient()

export async function getUiConfig(): Promise<RendererUiConfig> {
  try {
    return await apiClient.get<RendererUiConfig>('/v1/desktop/ui-config')
  } catch {
    return {}
  }
}

export async function setUiConfig(config: RendererUiConfig): Promise<RendererUiConfig> {
  try {
    return await apiClient.patch<RendererUiConfig>('/v1/desktop/ui-config', config)
  } catch {
    return config
  }
}

export async function getSystemLocale(): Promise<string> {
  try {
    const response = await apiClient.get<{ locale: string }>('/v1/desktop/system-locale')
    return response.locale
  } catch {
    return 'en-US'
  }
}
