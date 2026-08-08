import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AppAgentRuntime, AgentSessionSnapshot } from '../../../shared/agent-runtime'
import type { TerminalRun } from '../../../shared/terminal'
import type { TerminalService } from '../../terminal/terminal-service'
import { registerTerminalRoute } from './terminal-route'

const session: AgentSessionSnapshot = {
  id: 'session-1',
  workspaceId: null,
  workspacePath: '/tmp/tia-chats',
  title: 'Thread',
  providerId: 'provider-1',
  provider: 'openai',
  modelId: 'gpt-5',
  thinkingLevel: 'medium',
  accessMode: 'standard',
  pinned: false,
  status: 'idle',
  isCompacting: false,
  queue: { steering: [], followUps: [] },
  todos: [],
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z'
}

const run: TerminalRun = {
  id: 'terminal-1',
  sessionId: session.id,
  command: 'printf ok',
  cwd: session.workspacePath,
  status: 'running',
  output: '',
  startedAt: '2026-08-08T00:00:00.000Z'
}

function createApp(terminalRun: TerminalRun | null = run): {
  app: Hono
  stop: ReturnType<typeof vi.fn>
} {
  const app = new Hono()
  const stop = vi.fn(async () => true)
  const runtime = {
    getSession: vi.fn(async () => session)
  } as unknown as AppAgentRuntime
  const terminal = {
    get: vi.fn(() => terminalRun),
    listBySession: vi.fn(() => [terminalRun].filter(Boolean)),
    start: vi.fn(),
    stop,
    subscribe: vi.fn()
  } as unknown as TerminalService
  registerTerminalRoute(app, { runtime, terminal })
  return { app, stop }
}

describe('terminal route', () => {
  it('does not allow a session to stop or stream another session run', async () => {
    const { app, stop } = createApp({ ...run, sessionId: 'other-session' })

    const stopResponse = await app.request(
      'http://localhost/v1/agent/sessions/session-1/terminal/terminal-1/stop',
      { method: 'POST' }
    )
    const eventsResponse = await app.request(
      'http://localhost/v1/agent/sessions/session-1/terminal/terminal-1/events'
    )

    expect(stopResponse.status).toBe(404)
    expect(eventsResponse.status).toBe(404)
    expect(stop).not.toHaveBeenCalled()
  })

  it('stops a run belonging to the requested session', async () => {
    const { app, stop } = createApp()

    const response = await app.request(
      'http://localhost/v1/agent/sessions/session-1/terminal/terminal-1/stop',
      { method: 'POST' }
    )

    expect(response.status).toBe(200)
    expect(stop).toHaveBeenCalledWith('terminal-1')
  })
})
