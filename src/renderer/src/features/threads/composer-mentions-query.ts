import { useQuery } from '@tanstack/react-query'
import type { ComposerMentions } from '../../../../shared/composer-mentions'
import { createApiClient } from '../../lib/api-client'

const apiClient = createApiClient()

export const composerMentionKeys = {
  all: ['composer-mentions'] as const,
  workspace: (workspaceId: string) => [...composerMentionKeys.all, workspaceId] as const
}

export function useComposerMentions(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: composerMentionKeys.workspace(workspaceId ?? 'none'),
    queryFn: () =>
      apiClient.get<ComposerMentions>(
        `/v1/workspaces/${encodeURIComponent(workspaceId ?? '')}/composer-mentions`
      ),
    enabled: Boolean(workspaceId),
    staleTime: 30_000
  })
}
