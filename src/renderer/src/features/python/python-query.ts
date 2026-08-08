import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PythonCheckKind, PythonCheckResult, PythonProjectInfo } from '../../../../shared/python-tooling'
import { createApiClient } from '../../lib/api-client'

const api = createApiClient()

export const pythonKeys = {
  all: ['python-tooling'] as const,
  session: (sessionId: string) => [...pythonKeys.all, sessionId] as const
}

export function usePythonProject(sessionId: string | null) {
  return useQuery({
    queryKey: pythonKeys.session(sessionId ?? ''),
    queryFn: () => api.get<PythonProjectInfo>(`/v1/agent/sessions/${sessionId}/python`),
    enabled: Boolean(sessionId),
    refetchOnMount: 'always',
    staleTime: 30_000
  })
}

export function usePythonCheck(sessionId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (kind: PythonCheckKind) =>
      api.post<PythonCheckResult>(`/v1/agent/sessions/${sessionId}/python/check`, { kind }),
    onSuccess: () => client.invalidateQueries({ queryKey: pythonKeys.session(sessionId) })
  })
}
