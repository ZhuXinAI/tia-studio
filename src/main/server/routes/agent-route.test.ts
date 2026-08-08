import { Hono } from 'hono'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
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
    createTransientSession: vi.fn(async () => ({ ...snapshot, transient: true })),
    closeTransientSession: vi.fn(async () => undefined),
    promoteTransientSession: vi.fn(async () => snapshot),
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
      },
      artifactsRepo: {
        listBySession: vi.fn(async () => [
          {
            id: 'artifact-1',
            sessionId: 'session-1',
            name: 'report.md',
            kind: 'text' as const,
            createdAt: ''
          }
        ])
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

  it('creates a temporary MCP thread only in the built-in Chats workspace', async () => {
    const response = await app.request('http://localhost/v1/agent/transient-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'mcp-setup',
        providerId: 'provider-1',
        provider: 'openai',
        modelId: 'gpt-4o'
      })
    })

    expect(response.status).toBe(201)
    expect(runtime.createTransientSession).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'mcp-setup', workspacePath: '/tmp/tia-chats' })
    )
  })

  it('promotes a temporary thread into Chats', async () => {
    const response = await app.request(
      'http://localhost/v1/agent/transient-sessions/temporary-1/promote',
      { method: 'POST' }
    )

    expect(response.status).toBe(201)
    expect(runtime.promoteTransientSession).toHaveBeenCalledWith({
      sessionId: 'temporary-1',
      workspaceId: null,
      workspacePath: '/tmp/tia-chats'
    })
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

  it('lists artifacts for an existing session', async () => {
    const response = await app.request('http://localhost/v1/agent/sessions/session-1/artifacts')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: 'artifact-1', name: 'report.md' })
    ])
  })

  it('downloads an artifact only when it resolves inside the session workspace', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'tia-artifact-route-'))
    try {
      const artifactPath = join(workspacePath, 'report.md')
      await writeFile(artifactPath, '# Report\n', 'utf8')
      const artifactRepo = {
        listBySession: vi.fn(async () => [
          {
            id: 'artifact-file',
            sessionId: 'session-1',
            name: 'report.md',
            kind: 'text' as const,
            mimeType: 'text/markdown',
            relativePath: 'report.md',
            createdAt: ''
          }
        ])
      }
      vi.mocked(runtime.getSession).mockResolvedValue({ ...snapshot, workspacePath })
      const artifactApp = new Hono()
      registerAgentRoute(artifactApp, {
        runtime,
        sessionsRepo,
        artifactsRepo: artifactRepo,
        workspacesRepo: {
          ensureBuiltInChatsWorkspace: vi.fn(async () => ({
            ...snapshot,
            name: 'Chats',
            rootPath: workspacePath,
            builtInKind: 'chats' as const,
            isMissing: false
          })),
          getById: vi.fn(async () => null)
        }
      })

      const response = await artifactApp.request(
        'http://localhost/v1/agent/sessions/session-1/artifacts/artifact-file/content'
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Disposition')).toContain('attachment')
      await expect(response.text()).resolves.toBe('# Report\n')
    } finally {
      await rm(workspacePath, { recursive: true, force: true })
    }
  })

  it('rejects an artifact path that escapes the session workspace', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'tia-artifact-route-'))
    const outsidePath = await mkdtemp(join(tmpdir(), 'tia-artifact-outside-'))
    try {
      await writeFile(join(outsidePath, 'secret.txt'), 'secret', 'utf8')
      vi.mocked(runtime.getSession).mockResolvedValue({ ...snapshot, workspacePath })
      const artifactApp = new Hono()
      registerAgentRoute(artifactApp, {
        runtime,
        sessionsRepo,
        artifactsRepo: {
          listBySession: vi.fn(async () => [
            {
              id: 'artifact-outside',
              sessionId: 'session-1',
              name: 'secret.txt',
              kind: 'text' as const,
              relativePath: relative(workspacePath, join(outsidePath, 'secret.txt')),
              createdAt: ''
            }
          ])
        },
        workspacesRepo: {
          ensureBuiltInChatsWorkspace: vi.fn(async () => ({
            ...snapshot,
            name: 'Chats',
            rootPath: workspacePath,
            builtInKind: 'chats' as const,
            isMissing: false
          })),
          getById: vi.fn(async () => null)
        }
      })

      const response = await artifactApp.request(
        'http://localhost/v1/agent/sessions/session-1/artifacts/artifact-outside/content'
      )

      expect(response.status).toBe(404)
    } finally {
      await rm(outsidePath, { recursive: true, force: true })
      await rm(workspacePath, { recursive: true, force: true })
    }
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

  it('changes the thinking level through the runtime', async () => {
    const response = await app.request('http://localhost/v1/agent/sessions/session-1/thinking', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'high' })
    })

    expect(response.status).toBe(200)
    expect(runtime.setThinkingLevel).toHaveBeenCalledWith('session-1', 'high')
  })

  it('cancels an active run through the runtime', async () => {
    const response = await app.request('http://localhost/v1/agent/sessions/session-1/cancel', {
      method: 'POST'
    })

    expect(response.status).toBe(200)
    expect(runtime.cancelRun).toHaveBeenCalledWith('session-1')
  })

  it('closes a live thread before removing its persisted record', async () => {
    const response = await app.request('http://localhost/v1/agent/sessions/session-1', {
      method: 'DELETE'
    })

    expect(response.status).toBe(204)
    expect(runtime.closeSession).toHaveBeenCalledWith('session-1')
    expect(sessionsRepo.delete).toHaveBeenCalledWith('session-1')
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
