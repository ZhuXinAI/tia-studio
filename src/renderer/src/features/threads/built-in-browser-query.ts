import { createApiClient } from '../../lib/api-client'

const apiClient = createApiClient()

export async function showBuiltInBrowserWindow(): Promise<void> {
  await apiClient.post<{ ok: true }>('/v1/built-in-browser/show')
}
