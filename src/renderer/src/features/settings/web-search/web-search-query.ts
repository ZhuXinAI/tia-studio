import { createApiClient } from '../../../lib/api-client'

export type WebSearchEngine = 'google' | 'bing' | 'baidu'

export type WebSearchSettings = {
  defaultEngine: WebSearchEngine
  keepBrowserWindowOpen: boolean
  showBrowser: boolean
  showBuiltInBrowser: boolean
  availableEngines: WebSearchEngine[]
}

const apiClient = createApiClient()

export async function getWebSearchSettings(): Promise<WebSearchSettings> {
  return apiClient.get<WebSearchSettings>('/v1/settings/web-search')
}

export async function updateWebSearchSettings(input: {
  defaultEngine?: WebSearchEngine
  keepBrowserWindowOpen?: boolean
  showBrowser?: boolean
  showBuiltInBrowser?: boolean
}): Promise<WebSearchSettings> {
  return apiClient.patch<WebSearchSettings>('/v1/settings/web-search', input)
}
