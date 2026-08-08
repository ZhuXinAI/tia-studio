import { useQuery } from '@tanstack/react-query'
import type { AgentArtifact } from '../../../../shared/artifacts'
import { createApiClient } from '../../lib/api-client'

const api = createApiClient()

export const artifactKeys = {
  all: ['agent-artifacts'] as const,
  session: (sessionId: string) => [...artifactKeys.all, sessionId] as const
}

export async function listAgentArtifacts(sessionId: string): Promise<AgentArtifact[]> {
  return api.get<AgentArtifact[]>(`/v1/agent/sessions/${encodeURIComponent(sessionId)}/artifacts`)
}

export function useAgentArtifacts(sessionId: string | null) {
  return useQuery({
    queryKey: artifactKeys.session(sessionId ?? ''),
    queryFn: () => listAgentArtifacts(sessionId!),
    enabled: Boolean(sessionId),
    refetchOnMount: 'always',
    refetchInterval: 3_000
  })
}
