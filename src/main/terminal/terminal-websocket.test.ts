import { createServer, type Server } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { once } from 'node:events'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WebSocket } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import type { TerminalSocketEvent } from '../../shared/terminal'
import { removeTestDirectory } from '../../test/remove-test-directory'
import { TerminalService } from './terminal-service'
import { attachTerminalWebSocketServer, type TerminalWebSocketServer } from './terminal-websocket'

let directory: string | undefined
let service: TerminalService | undefined
let server: Server | undefined
let websocketServer: TerminalWebSocketServer | undefined
let client: WebSocket | undefined

async function waitForEvent(
  events: TerminalSocketEvent[],
  type: TerminalSocketEvent['type']
): Promise<TerminalSocketEvent> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const event = events.find((candidate) => candidate.type === type)
    if (event) return event
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`terminal websocket event ${type} was not received`)
}

afterEach(async () => {
  client?.close()
  await websocketServer?.close()
  if (service) await service.stopAll()
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()))
  }
  if (directory) await removeTestDirectory(directory)
  client = undefined
  websocketServer = undefined
  server = undefined
  service = undefined
  directory = undefined
})

describe('terminal websocket', () => {
  it('streams a real pty snapshot and accepts input', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-terminal-websocket-'))
    service = new TerminalService()
    const run = await service.start({
      sessionId: 'session-1',
      workspacePath: directory,
      command: 'cat'
    })
    server = createServer()
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server did not bind')
    websocketServer = attachTerminalWebSocketServer({
      server,
      terminal: service,
      token: 'test-token'
    })

    const events: TerminalSocketEvent[] = []
    client = new WebSocket(
      `ws://127.0.0.1:${address.port}/v1/agent/sessions/session-1/terminal/${run.id}/socket?token=test-token`
    )
    client.on('message', (payload) =>
      events.push(JSON.parse(String(payload)) as TerminalSocketEvent)
    )
    await once(client, 'open')
    const snapshot = await waitForEvent(events, 'snapshot')
    expect(snapshot.type === 'snapshot' ? snapshot.run.id : '').toBe(run.id)

    client.send(JSON.stringify({ type: 'input', data: 'websocket-input\n' }))
    const output = await waitForEvent(events, 'output')
    expect(output.type === 'output' ? output.data : '').toContain('websocket-input')
  })
})
