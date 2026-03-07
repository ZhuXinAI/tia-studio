import { createUIMessageStreamResponse } from 'ai'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { UIMessage } from 'ai'
import { TeamRunStatusStore } from '../chat/team-run-status-store'
import { registerTeamChatRoute } from './team-chat-route'

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    createUIMessageStreamResponse: vi.fn(actual.createUIMessageStreamResponse)
  }
})

describe('team chat route', () => {
  it('returns team thread history', async () => {
    const streamTeamChat = vi.fn()
    const historyMessages: UIMessage[] = [
      {
        id: 'msg-user',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello team' }]
      }
    ]
    const listTeamThreadMessages = vi.fn(async () => historyMessages)
    const app = new Hono()
    registerTeamChatRoute(app, {
      teamRuntime: {
        streamTeamChat,
        listTeamThreadMessages
      },
      teamRunStatusStore: new TeamRunStatusStore()
    })

    const response = await app.request(
      'http://localhost/team-chat/team-thread-1/history?profileId=default-profile'
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(historyMessages)
    expect(listTeamThreadMessages).toHaveBeenCalledWith({
      threadId: 'team-thread-1',
      profileId: 'default-profile'
    })
  })

  it('streams team chat responses and exposes the run id header', async () => {
    const streamTeamChat = vi.fn(async () => ({
      runId: 'run-1',
      stream: new ReadableStream({
        start(controller) {
          controller.close()
        }
      })
    }))
    const listTeamThreadMessages = vi.fn(async () => [])
    const app = new Hono()
    registerTeamChatRoute(app, {
      teamRuntime: {
        streamTeamChat,
        listTeamThreadMessages
      },
      teamRunStatusStore: new TeamRunStatusStore()
    })

    const response = await app.request('http://localhost/team-chat/team-thread-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [],
        profileId: 'default-profile'
      })
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('x-team-run-id')).toBe('run-1')
    expect(createUIMessageStreamResponse).toHaveBeenCalled()
  })

  it('returns status events for an active run', async () => {
    const teamRunStatusStore = new TeamRunStatusStore()
    teamRunStatusStore.startRun({ runId: 'run-1', threadId: 'team-thread-1' })

    const app = new Hono()
    registerTeamChatRoute(app, {
      teamRuntime: {
        streamTeamChat: vi.fn(async () => ({
          runId: 'run-1',
          stream: new ReadableStream()
        })),
        listTeamThreadMessages: vi.fn(async () => [])
      },
      teamRunStatusStore
    })

    const response = await app.request(
      'http://localhost/team-chat/team-thread-1/runs/run-1/status'
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    await response.body?.cancel()
  })
})
