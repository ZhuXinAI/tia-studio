import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentSessionSnapshot,
  AppAgentEvent,
  AppAgentRuntime
} from '../../../shared/agent-runtime'
import type { AgentSessionsRepository } from '../../persistence/repos/agent-sessions-repo'
import { registerAgentRoute } from './agent-route'

const snapshot: AgentSessionSnapshot = {
  id: 'session-1',
  workspaceId: null,
  workspacePath: '/tmp/tia-chats',
  title: 'New thread',
  providerId: 'provider-1',
  provider: 'openai',
  modelId: 'gpt-4o',
  thinkingLevel: 'medium',
  accessMode: 'standard',
  pinned: false,
  status: 'idle',
  isCompacting: false,
  queue: { steering: [], followUps: [] },
  todos: [],
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z'
}

function createRuntime(): AppAgentRuntime {
  return {
    createSession: vi.fn(async () => snapshot),
    resumeSession: vi.fn(async () => snapshot),
    closeSession: vi.fn(async () => undefined),
    sendMessage: vi.fn(async () => ({ commandId: 'command-1', accepted: true })),
    cancelRun: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    setThinkingLevel: vi.fn(async () => undefined),
    setAccessMode: vi.fn(async () => undefined),
    renameSession: vi.fn(async () => undefined),
    getSession: vi.fn(async () => snapshot),
    getMessages: vi.fn(async () => []),
    respondToInteraction: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined)
  }
}

describe('agent route', () => {
  let app: Hono
  let runtime: AppAgentRuntime
  let sessionsRepo: AgentSessionsRepository

  beforeEach(() => {
    app = new Hono()
    runtime = createRuntime()
    sessionsRepo = {
      list: vi.fn(async () => []),
      listByWorkspace: vi.fn(async () => []),
      delete: vi.fn(async () => true),
      update: vi.fn(async () => snapshot)
    } as unknown as AgentSessionsRepository
    registerAgentRoute(app, {
      runtime,
      sessionsRepo,
      workspacesRepo: {
        ensureBuiltInChatsWorkspace: vi.fn(async () => ({
          id: 'chats',
          name: 'Chats',
          rootPath: '/tmp/tia-chats',
          createdAt: '',
          updatedAt: '',
          builtInKind: 'chats' as const,
          isMissing: false
        })),
        getById: vi.fn(async () => null)
      }
    })
  })

  it('creates a session only in the authoritative workspace path', async () => {
    const response = await app.request('http://localhost/v1/agent/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: null,
        workspacePath: '/tmp/tia-chats',
        providerId: 'provider-1',
        provider: 'openai',
        modelId: 'gpt-4o'
      })
    })

    expect(response.status).toBe(201)
    expect(runtime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspacePath: '/tmp/tia-chats' })
    )
  })

  it('rejects an injected workspace path', async () => {
    const response = await app.request('http://localhost/v1/agent/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: null,
        workspacePath: '/tmp/outside',
        providerId: 'provider-1',
        provider: 'openai',
        modelId: 'gpt-4o'
      })
    })

    expect(response.status).toBe(403)
    expect(runtime.createSession).not.toHaveBeenCalled()
  })

  it('opens a backoff circuit after Pi startup fails', async () => {
    vi.mocked(runtime.createSession).mockRejectedValue(new Error('startup failed'))
    const request = () =>
      app.request('http://localhost/v1/agent/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: null,
          workspacePath: '/tmp/tia-chats',
          providerId: 'provider-1',
          provider: 'openai',
          modelId: 'gpt-4o'
        })
      })

    expect((await request()).status).toBe(500)
    expect((await request()).status).toBe(429)
    expect(runtime.createSession).toHaveBeenCalledOnce()
  })

  it('validates image messages before dispatch', async () => {
    const response = await app.request('http://localhost/v1/agent/sessions/session-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '',
        attachments: [
          { id: 'a', type: 'image', name: 'bad.txt', mimeType: 'text/plain', size: 1, data: 'x' }
        ]
      })
    })

    expect(response.status).toBe(400)
    expect(runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('changes the active model through the runtime', async () => {
    const response = await app.request('http://localhost/v1/agent/sessions/session-1/model', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'provider-1', provider: 'openai', modelId: 'gpt-5' })
    })

    expect(response.status).toBe(200)
    expect(runtime.setModel).toHaveBeenCalledWith('session-1', 'provider-1', 'openai', 'gpt-5')
  })

  it('accepts a structured permission outcome', async () => {
    const response = await app.request(
      'http://localhost/v1/agent/sessions/session-1/interactions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'permission-1', permissionOutcome: 'allow-workspace' })
      }
    )

    expect(response.status).toBe(200)
    expect(runtime.respondToInteraction).toHaveBeenCalledWith('session-1', {
      id: 'permission-1',
      permissionOutcome: 'allow-workspace'
    })
  })

  it('streams ordered application events over SSE and unsubscribes on cancel', async () => {
    let listener: ((event: AppAgentEvent) => void) | undefined
    const unsubscribe = vi.fn()
    vi.mocked(runtime.subscribe).mockImplementation((_sessionId, next) => {
      listener = next
      return unsubscribe
    })
    const response = await app.request('http://localhost/v1/agent/sessions/session-1/events')
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(decoder.decode((await reader.read()).value)).toBe(': connected\n\n')
    listener!({
      eventId: 'event-1',
      sessionId: 'session-1',
      sequence: 1,
      timestamp: '2026-07-16T00:00:00.000Z',
      source: 'pi-sdk',
      type: 'runtime.notice',
      level: 'info',
      text: 'ready'
    })
    expect(decoder.decode((await reader.read()).value)).toContain('id: event-1')
    await reader.cancel()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
