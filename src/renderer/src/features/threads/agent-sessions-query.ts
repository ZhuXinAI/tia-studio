import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AgentAccessMode,
  AgentCommandReceipt,
  AgentInteractionResponse,
  AgentSessionSnapshot,
  AppAgentEvent,
  AppAgentMessage,
  CreateAgentSessionInput,
  SendAgentMessageInput
} from '../../../../shared/agent-runtime'
import { createApiClient } from '../../lib/api-client'
import { getDesktopBootstrap } from '../../lib/desktop-bootstrap'
import { createHttpError } from '../../lib/request-errors'

const api = createApiClient()

export const agentSessionKeys = {
  all: ['agent-sessions'] as const,
  list: (workspaceId?: string | null) => [...agentSessionKeys.all, 'list', workspaceId] as const,
  detail: (sessionId: string) => [...agentSessionKeys.all, 'detail', sessionId] as const,
  messages: (sessionId: string) => [...agentSessionKeys.detail(sessionId), 'messages'] as const
}

export async function listAgentSessions(
  workspaceId?: string | null
): Promise<AgentSessionSnapshot[]> {
  const query =
    workspaceId === undefined ? '' : `?workspaceId=${encodeURIComponent(workspaceId ?? 'chats')}`
  return api.get<AgentSessionSnapshot[]>(`/v1/agent/sessions${query}`)
}

export function useAgentSessions(workspaceId?: string | null, enabled = true) {
  return useQuery({
    queryKey: agentSessionKeys.list(workspaceId),
    queryFn: () => listAgentSessions(workspaceId),
    enabled,
    refetchInterval: 3_000
  })
}

export function useAgentSession(sessionId: string | null) {
  return useQuery({
    queryKey: agentSessionKeys.detail(sessionId ?? ''),
    queryFn: () => api.get<AgentSessionSnapshot>(`/v1/agent/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
    refetchOnMount: 'always'
  })
}

export function useAgentMessages(sessionId: string | null) {
  return useQuery({
    queryKey: agentSessionKeys.messages(sessionId ?? ''),
    queryFn: () => api.get<AppAgentMessage[]>(`/v1/agent/sessions/${sessionId}/messages`),
    enabled: Boolean(sessionId),
    refetchOnMount: 'always'
  })
}

export function useCreateAgentSession() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAgentSessionInput) =>
      api.post<AgentSessionSnapshot>('/v1/agent/sessions', input),
    onSuccess: (session) => {
      client.setQueryData(agentSessionKeys.detail(session.id), session)
      client.invalidateQueries({ queryKey: agentSessionKeys.all })
    }
  })
}

export function useDeleteAgentSession() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => api.delete(`/v1/agent/sessions/${sessionId}`),
    onSuccess: () => client.invalidateQueries({ queryKey: agentSessionKeys.all })
  })
}

export function useSetAgentSessionPinned() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, pinned }: { sessionId: string; pinned: boolean }) =>
      api.patch<AgentSessionSnapshot>(`/v1/agent/sessions/${sessionId}/pinned`, { pinned }),
    onSuccess: (session) => {
      client.setQueryData(agentSessionKeys.detail(session.id), session)
      client.invalidateQueries({ queryKey: agentSessionKeys.all })
    }
  })
}

export async function sendAgentMessage(input: SendAgentMessageInput): Promise<AgentCommandReceipt> {
  return api.post<AgentCommandReceipt>(`/v1/agent/sessions/${input.sessionId}/messages`, {
    text: input.text,
    behavior: input.behavior,
    attachments: input.attachments
  })
}

export async function cancelAgentRun(sessionId: string): Promise<void> {
  await api.post(`/v1/agent/sessions/${sessionId}/cancel`)
}

export async function setAgentAccessMode(
  sessionId: string,
  mode: AgentAccessMode
): Promise<AgentSessionSnapshot> {
  return api.patch<AgentSessionSnapshot>(`/v1/agent/sessions/${sessionId}/access`, { mode })
}

export async function setAgentModel(
  sessionId: string,
  providerId: string,
  provider: string,
  modelId: string
): Promise<AgentSessionSnapshot> {
  return api.patch<AgentSessionSnapshot>(`/v1/agent/sessions/${sessionId}/model`, {
    providerId,
    provider,
    modelId
  })
}

export async function renameAgentSession(
  sessionId: string,
  title: string
): Promise<AgentSessionSnapshot> {
  return api.patch<AgentSessionSnapshot>(`/v1/agent/sessions/${sessionId}/title`, { title })
}

export async function respondToAgentInteraction(
  sessionId: string,
  response: AgentInteractionResponse
): Promise<void> {
  await api.post(`/v1/agent/sessions/${sessionId}/interactions`, response)
}

function parseEventBlock(block: string): AppAgentEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
  if (!data) return null
  try {
    return JSON.parse(data) as AppAgentEvent
  } catch {
    return null
  }
}

export function subscribeToAgentSession(input: {
  sessionId: string
  onEvent: (event: AppAgentEvent) => void
  onError?: (error: unknown) => void
}): () => void {
  const controller = new AbortController()
  void (async () => {
    try {
      const bootstrap = await getDesktopBootstrap()
      const headers: Record<string, string> = {}
      if (bootstrap.authMode === 'bearer' && bootstrap.authToken) {
        headers.Authorization = `Bearer ${bootstrap.authToken}`
      }
      const response = await fetch(
        `${bootstrap.apiBaseUrl}/v1/agent/sessions/${input.sessionId}/events`,
        { headers, signal: controller.signal }
      )
      if (!response.ok) throw createHttpError(response.status, await response.text())
      const reader = response.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const next = await reader.read()
        if (next.done) break
        buffer += decoder.decode(next.value, { stream: true })
        let delimiter = buffer.indexOf('\n\n')
        while (delimiter >= 0) {
          const event = parseEventBlock(buffer.slice(0, delimiter))
          buffer = buffer.slice(delimiter + 2)
          if (event) input.onEvent(event)
          delimiter = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) input.onError?.(error)
    }
  })()
  return () => controller.abort()
}
