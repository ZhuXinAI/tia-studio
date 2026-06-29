import { useQuery } from '@tanstack/react-query'
import { createApiClient } from '../../lib/api-client'
import type { DesktopSkillRecord } from '../../../../shared/desktop-discovery'

const apiClient = createApiClient()

export const skillCatalogKeys = {
  all: ['desktop-skills'] as const,
  list: () => [...skillCatalogKeys.all, 'list'] as const
}

export async function listDesktopSkills(): Promise<DesktopSkillRecord[]> {
  const response = await apiClient.get<{ skills: DesktopSkillRecord[] }>('/v1/desktop/skills')
  return response.skills
}

export function useDesktopSkills() {
  return useQuery({
    queryKey: skillCatalogKeys.list(),
    queryFn: listDesktopSkills
  })
}
