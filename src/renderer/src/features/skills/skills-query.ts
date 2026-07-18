import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SkillInstallScope,
  SkillMarketplaceRecord
} from '../../../../shared/skill-marketplace'
import { createApiClient } from '../../lib/api-client'

const api = createApiClient()

export const skillMarketplaceKeys = {
  all: ['skill-marketplace'] as const,
  list: (workspaceId?: string) => [...skillMarketplaceKeys.all, workspaceId ?? 'global'] as const
}

export function useSkillMarketplace(workspaceId?: string) {
  return useQuery({
    queryKey: skillMarketplaceKeys.list(workspaceId),
    queryFn: async () => {
      const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
      return (
        await api.get<{ skills: SkillMarketplaceRecord[] }>(`/v1/desktop/skill-marketplace${query}`)
      ).skills
    }
  })
}

export function useInstallMarketplaceSkill() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { skillId: string; scope: SkillInstallScope; workspaceId?: string }) =>
      api.post('/v1/desktop/skill-marketplace/install', input),
    onSuccess: () => client.invalidateQueries({ queryKey: skillMarketplaceKeys.all })
  })
}
