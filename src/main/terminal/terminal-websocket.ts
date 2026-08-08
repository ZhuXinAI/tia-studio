import type { IncomingMessage, Server } from 'node:http'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import type { TerminalClientEvent, TerminalEvent, TerminalSocketEvent } from '../../shared/terminal'
import type { TerminalService } from './terminal-service'

const TERMINAL_SOCKET_PATH = /^\/v1\/agent\/sessions\/([^/]+)\/terminal\/([^/]+)\/socket$/
const MAX_INPUT_LENGTH = 64_000

function rawDataToString(data: RawData): string {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return data.toString('utf8')
}

function parseClientEvent(data: RawData): TerminalClientEvent {
  const value: unknown = JSON.parse(rawDataToString(data))
  if (!value || typeof value !== 'object') throw new Error('Terminal event must be an object')

  const event = value as Record<string, unknown>
  if (event.type === 'input' && typeof event.data === 'string') {
    if (event.data.length > MAX_INPUT_LENGTH) throw new Error('Terminal input is too long')
    return { type: 'input', data: event.data }
  }

  if (
    event.type === 'resize' &&
    typeof event.cols === 'number' &&
    Number.isFinite(event.cols) &&
    typeof event.rows === 'number' &&
    Number.isFinite(event.rows)
  ) {
    return { type: 'resize', cols: event.cols, rows: event.rows }
  }

  throw new Error('Unsupported terminal event')
}

function send(socket: WebSocket, event: TerminalSocketEvent): void {
  if (socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify(event))
}

function rejectUpgrade(
  socket: { write(data: string): boolean; destroy(): void },
  status: number
): void {
  const statusText = status === 401 ? 'Unauthorized' : status === 404 ? 'Not Found' : 'Bad Request'
  socket.write(`HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

export type TerminalWebSocketServer = {
  close: () => Promise<void>
}

export function attachTerminalWebSocketServer(options: {
  server: Server
  token?: string
  terminal: TerminalService
}): TerminalWebSocketServer {
  const websocketServer = new WebSocketServer({ noServer: true })

  const handleUpgrade = (
    request: IncomingMessage,
    socket: import('node:net').Socket,
    head: Buffer
  ) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
    const match = TERMINAL_SOCKET_PATH.exec(url.pathname)
    if (!match) return

    if (options.token && url.searchParams.get('token') !== options.token) {
      rejectUpgrade(socket, 401)
      return
    }

    const sessionId = decodeURIComponent(match[1] ?? '')
    const terminalId = decodeURIComponent(match[2] ?? '')
    const run = options.terminal.get(terminalId)
    if (!run || run.sessionId !== sessionId) {
      rejectUpgrade(socket, 404)
      return
    }

    websocketServer.handleUpgrade(request, socket, head, (client) => {
      let unsubscribe: () => void = () => undefined
      const cleanup = () => {
        unsubscribe()
        unsubscribe = () => undefined
      }

      client.on('close', cleanup)
      client.on('message', (payload: RawData) => {
        try {
          const event = parseClientEvent(payload)
          if (event.type === 'input') {
            if (!options.terminal.write(terminalId, event.data)) {
              send(client, { type: 'error', message: 'Terminal session is not running' })
            }
          } else {
            options.terminal.resize(terminalId, event.cols, event.rows)
          }
        } catch (error) {
          send(client, {
            type: 'error',
            message: error instanceof Error ? error.message : 'Invalid terminal event'
          })
        }
      })

      unsubscribe = options.terminal.subscribe(terminalId, (event: TerminalEvent) => {
        if (event.type === 'output') {
          send(client, { type: 'output', data: event.text })
        } else {
          send(client, { type: 'state', run: event.run })
        }
      })
      send(client, { type: 'snapshot', data: run.output, run })
    })
  }

  options.server.on('upgrade', handleUpgrade)

  return {
    close: async () => {
      options.server.off('upgrade', handleUpgrade)
      for (const client of websocketServer.clients) client.close()
      await new Promise<void>((resolve) => {
        websocketServer.close(() => resolve())
      })
    }
  }
}
