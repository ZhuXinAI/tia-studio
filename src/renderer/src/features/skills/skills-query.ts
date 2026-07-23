import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SkillMarketplaceRecord } from '../../../../shared/skill-marketplace'
import { createApiClient } from '../../lib/api-client'

const api = createApiClient()

export const skillMarketplaceKeys = {
  all: ['skill-marketplace'] as const,
  list: () => [...skillMarketplaceKeys.all, 'global'] as const
}

export function useSkillMarketplace() {
  return useQuery({
    queryKey: skillMarketplaceKeys.list(),
    queryFn: async () => {
      return (await api.get<{ skills: SkillMarketplaceRecord[] }>('/api/skills/top')).skills
    }
  })
}

export function useInstallMarketplaceSkill() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { skillId: string }) =>
      api.post('/v1/desktop/skill-marketplace/install', input),
    onSuccess: () => client.invalidateQueries({ queryKey: skillMarketplaceKeys.all })
  })
}
