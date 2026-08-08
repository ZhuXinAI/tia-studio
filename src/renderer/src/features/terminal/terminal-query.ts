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

export const TERMINAL_SOCKET_CONNECTION_FAILED = 'terminal-socket-connection-failed'

const TERMINAL_SOCKET_MAX_RECONNECT_ATTEMPTS = 5
const TERMINAL_SOCKET_RECONNECT_BASE_DELAY_MS = 250

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
  onClose?: (willRetry: boolean) => void,
  onOpen?: (send: (event: TerminalClientEvent) => void) => void,
  onRetryExhausted?: () => void
): () => void {
  let disposed = false
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0

  const scheduleReconnect = (): boolean => {
    if (disposed || reconnectAttempt >= TERMINAL_SOCKET_MAX_RECONNECT_ATTEMPTS) return false
    const delay = Math.min(TERMINAL_SOCKET_RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt, 2_000)
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, delay)
    return true
  }

  const handleClose = (): void => {
    const willRetry = scheduleReconnect()
    onClose?.(willRetry)
    if (!willRetry) onRetryExhausted?.()
  }

  const connect = async (): Promise<void> => {
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

      const currentSocket = new WebSocket(url)
      socket = currentSocket
      const sendEvent = (event: TerminalClientEvent): void => {
        if (currentSocket.readyState === WebSocket.OPEN) {
          currentSocket.send(JSON.stringify(event))
        }
      }
      currentSocket.onopen = () => {
        reconnectAttempt = 0
        onOpen?.(sendEvent)
      }
      currentSocket.onmessage = (event) => {
        try {
          onEvent(JSON.parse(String(event.data)) as TerminalSocketEvent)
        } catch (error) {
          onError?.(error)
        }
      }
      currentSocket.onerror = () => {
        if (disposed || socket !== currentSocket) return
        onError?.(new Error(TERMINAL_SOCKET_CONNECTION_FAILED))
        currentSocket.close()
      }
      currentSocket.onclose = () => {
        if (socket === currentSocket) socket = null
        if (!disposed) handleClose()
      }
    } catch (error) {
      if (disposed) return
      onError?.(error)
      handleClose()
    }
  }

  void connect()

  return () => {
    disposed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    socket?.close()
    reconnectTimer = null
    socket = null
  }
}
