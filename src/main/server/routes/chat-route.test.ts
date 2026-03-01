import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { ChatRouteError } from '../chat/chat-errors'
import { registerChatRoute } from './chat-route'

describe('chat route', () => {
  it('streams chat with thread and profile ids', async () => {
    const streamChat = vi.fn(async () => new ReadableStream())
    const app = new Hono()
    registerChatRoute(app, {
      assistantRuntime: {
        streamChat
      }
    })

    const response = await app.request('http://localhost/chat/assistant-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [],
        threadId: 'thread-1',
        profileId: 'profile-1'
      })
    })

    expect(response.status).toBe(200)
    expect(streamChat).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      messages: [],
      threadId: 'thread-1',
      profileId: 'profile-1',
      trigger: undefined
    })
  })

  it('rejects invalid chat payload', async () => {
    const streamChat = vi.fn(async () => new ReadableStream())
    const app = new Hono()
    registerChatRoute(app, {
      assistantRuntime: {
        streamChat
      }
    })

    const response = await app.request('http://localhost/chat/assistant-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: []
      })
    })

    expect(response.status).toBe(400)
    expect(streamChat).not.toHaveBeenCalled()
  })

  it('returns structured error when assistant is not ready', async () => {
    const streamChat = vi.fn(async () => {
      throw new ChatRouteError(409, 'assistant_not_ready', 'Assistant workspace is not configured')
    })
    const app = new Hono()
    registerChatRoute(app, {
      assistantRuntime: {
        streamChat
      }
    })

    const response = await app.request('http://localhost/chat/assistant-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [],
        threadId: 'thread-1',
        profileId: 'profile-1'
      })
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'assistant_not_ready'
    })
  })
})
