import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  TerminalClientEvent,
  TerminalEvent,
  TerminalRun,
  TerminalSocketEvent
} from '../../../../shared/terminal'
import { createApiClient } from '../../lib/api-client'
import { getDesktopBootstrap } from '../../lib/desktop-bootstrap'
import { createHttpError } from '../../lib/request-errors'

const api = createApiClient()

export const terminalKeys = {
  all: ['terminal-runs'] as const,
  session: (sessionId: string) => [...terminalKeys.all, sessionId] as const
}

export function useTerminalRuns(sessionId: string | null) {
  return useQuery({
    queryKey: terminalKeys.session(sessionId ?? ''),
    queryFn: () => api.get<TerminalRun[]>(`/v1/agent/sessions/${sessionId}/terminal`),
    enabled: Boolean(sessionId),
    refetchInterval: 2_000
  })
}

export function useStartTerminal(sessionId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      command,
      cwd,
      cols,
      rows
    }: {
      command?: string
      cwd?: string
      cols?: number
      rows?: number
    }) =>
      api.post<TerminalRun>(`/v1/agent/sessions/${sessionId}/terminal`, {
        ...(command ? { command } : {}),
        ...(cwd ? { cwd } : {}),
        ...(cols ? { cols } : {}),
        ...(rows ? { rows } : {})
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: terminalKeys.session(sessionId) })
  })
}

export function useStopTerminal(sessionId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (terminalId: string) =>
      api.post(
        `/v1/agent/sessions/${encodeURIComponent(sessionId)}/terminal/${encodeURIComponent(terminalId)}/stop`
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: terminalKeys.session(sessionId) })
  })
}

function parseEventBlock(block: string): TerminalEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
  if (!data) return null
  try {
    return JSON.parse(data) as TerminalEvent
  } catch {
    return null
  }
}

export function subscribeToTerminal(
  sessionId: string,
  terminalId: string,
  onEvent: (event: TerminalEvent) => void,
  onError?: (error: unknown) => void
): () => void {
  const controller = new AbortController()
  void (async () => {
    try {
      const bootstrap = await getDesktopBootstrap()
      const headers: Record<string, string> = {}
      if (bootstrap.authMode === 'bearer' && bootstrap.authToken) {
        headers.Authorization = `Bearer ${bootstrap.authToken}`
      }
      const response = await fetch(
        `${bootstrap.apiBaseUrl}/v1/agent/sessions/${encodeURIComponent(sessionId)}/terminal/${encodeURIComponent(terminalId)}/events`,
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
          if (event) onEvent(event)
          delimiter = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) onError?.(error)
    }
  })()
  return () => controller.abort()
}

export function subscribeToTerminalSocket(
  sessionId: string,
  terminalId: string,
  onEvent: (event: TerminalSocketEvent) => void,
  onError?: (error: unknown) => void,
  onClose?: () => void,
  onOpen?: (send: (event: TerminalClientEvent) => void) => void
): () => void {
  let disposed = false
  let socket: WebSocket | null = null

  void (async () => {
    try {
      const bootstrap = await getDesktopBootstrap()
      if (disposed) return

      const url = new URL(bootstrap.apiBaseUrl)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.pathname = `/v1/agent/sessions/${encodeURIComponent(sessionId)}/terminal/${encodeURIComponent(terminalId)}/socket`
      url.search = ''
      if (bootstrap.authMode === 'bearer' && bootstrap.authToken) {
        url.searchParams.set('token', bootstrap.authToken)
      }

      socket = new WebSocket(url)
      const sendEvent = (event: TerminalClientEvent): void => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(event))
        }
      }
      socket.onopen = () => onOpen?.(sendEvent)
      socket.onmessage = (event) => {
        try {
          onEvent(JSON.parse(String(event.data)) as TerminalSocketEvent)
        } catch (error) {
          onError?.(error)
        }
      }
      socket.onerror = () => onError?.(new Error('Terminal connection failed'))
      socket.onclose = () => {
        socket = null
        if (!disposed) onClose?.()
      }
    } catch (error) {
      if (!disposed) onError?.(error)
    }
  })()

  return () => {
    disposed = true
    socket?.close()
    socket = null
  }
}
