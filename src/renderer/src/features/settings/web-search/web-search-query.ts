import { createApiClient } from '../../../lib/api-client'

export type BrowserAutomationMode = 'built-in-browser' | 'tia-browser-tool'

export type WebSearchSettings = {
  keepBrowserWindowOpen: boolean
  showBrowser: boolean
  showBuiltInBrowser: boolean
  showTiaBrowserTool: boolean
  browserAutomationMode: BrowserAutomationMode
}

const apiClient = createApiClient()

export async function getWebSearchSettings(): Promise<WebSearchSettings> {
  return apiClient.get<WebSearchSettings>('/v1/settings/web-search')
}

export async function updateWebSearchSettings(input: {
  keepBrowserWindowOpen?: boolean
  showBrowser?: boolean
  showBuiltInBrowser?: boolean
  showTiaBrowserTool?: boolean
  browserAutomationMode?: BrowserAutomationMode
}): Promise<WebSearchSettings> {
  return apiClient.patch<WebSearchSettings>('/v1/settings/web-search', input)
}
