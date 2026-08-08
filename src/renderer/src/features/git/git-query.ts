import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GitReview } from '../../../../shared/git-review'
import { createApiClient } from '../../lib/api-client'

const api = createApiClient()

export const gitKeys = {
  all: ['git-review'] as const,
  session: (sessionId: string) => [...gitKeys.all, sessionId] as const
}

export function useGitReview(sessionId: string | null) {
  return useQuery({
    queryKey: gitKeys.session(sessionId ?? ''),
    queryFn: () => api.get<GitReview>(`/v1/agent/sessions/${sessionId}/git/review`),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000
  })
}

function useGitPathMutation(sessionId: string, action: 'stage' | 'unstage') {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.post<GitReview>(`/v1/agent/sessions/${sessionId}/git/${action}`, { paths }),
    onSuccess: (review) => client.setQueryData(gitKeys.session(sessionId), review)
  })
}

export function useStageGitPaths(sessionId: string) {
  return useGitPathMutation(sessionId, 'stage')
}

export function useUnstageGitPaths(sessionId: string) {
  return useGitPathMutation(sessionId, 'unstage')
}
