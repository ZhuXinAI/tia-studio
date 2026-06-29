import { useQuery } from '@tanstack/react-query'
import { createApiClient } from '../../lib/api-client'
import type { DesktopAutomationRecord } from '../../../../shared/desktop-discovery'

const apiClient = createApiClient()

export const automationCatalogKeys = {
  all: ['desktop-automations'] as const,
  list: () => [...automationCatalogKeys.all, 'list'] as const
}

export async function listDesktopAutomations(): Promise<DesktopAutomationRecord[]> {
  const response = await apiClient.get<{ automations: DesktopAutomationRecord[] }>(
    '/v1/desktop/automations'
  )
  return response.automations
}

export function useDesktopAutomations() {
  return useQuery({
    queryKey: automationCatalogKeys.list(),
    queryFn: listDesktopAutomations
  })
}
