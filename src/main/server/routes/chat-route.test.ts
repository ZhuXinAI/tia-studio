import { Hono } from 'hono'
import type { UIMessage } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import type { AssistantRuntime } from '../../mastra/assistant-runtime'
import { ChatRouteError } from '../chat/chat-errors'
import { registerChatRoute } from './chat-route'

function createAssistantRuntimeStub(overrides: Partial<AssistantRuntime>): AssistantRuntime {
  return {
    streamChat: vi.fn(async () => new ReadableStream()),
    listThreadMessages: vi.fn(async () => []),
    runCronJob: vi.fn(async () => ({ outputText: '' })),
    ...overrides
  }
}

describe('chat route', () => {
  it('streams chat with thread and profile ids', async () => {
    const streamChat = vi.fn(async () => new ReadableStream())
    const listThreadMessages = vi.fn(async () => [])
    const app = new Hono()
    registerChatRoute(app, {
      assistantRuntime: createAssistantRuntimeStub({
        streamChat,
        listThreadMessages
      })
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
      trigger: undefined,
      abortSignal: expect.any(AbortSignal)
    })
    expect(listThreadMessages).not.toHaveBeenCalled()
  })

  it('rejects invalid chat payload', async () => {
    const streamChat = vi.fn(async () => new ReadableStream())
    const listThreadMessages = vi.fn(async () => [])
    const app = new Hono()
    registerChatRoute(app, {
      assistantRuntime: createAssistantRuntimeStub({
        streamChat,
        listThreadMessages
      })
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
    expect(listThreadMessages).not.toHaveBeenCalled()
  })

  it('returns structured error when assistant is not ready', async () => {
    const streamChat = vi.fn(async () => {
      throw new ChatRouteError(409, 'assistant_not_ready', 'Assistant workspace is not configured')
    })
    const listThreadMessages = vi.fn(async () => [])
    const app = new Hono()
    registerChatRoute(app, {
      assistantRuntime: createAssistantRuntimeStub({
        streamChat,
        listThreadMessages
      })
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
    expect(listThreadMessages).not.toHaveBeenCalled()
  })

  it('returns message history for a thread', async () => {
    const streamChat = vi.fn(async () => new ReadableStream())
    const historyMessages: UIMessage[] = [
      {
        id: 'msg-user',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello there' }]
      },
      {
        id: 'msg-assistant',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi! How can I help?' }]
      }
    ]
    const listThreadMessages = vi.fn(async () => historyMessages)
    const app = new Hono()
    registerChatRoute(app, {
      assistantRuntime: createAssistantRuntimeStub({
        streamChat,
        listThreadMessages
      })
    })

    const response = await app.request(
      'http://localhost/chat/assistant-1/history?threadId=thread-1&profileId=profile-1'
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(historyMessages)
    expect(listThreadMessages).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      threadId: 'thread-1',
      profileId: 'profile-1'
    })
    expect(streamChat).not.toHaveBeenCalled()
  })

  it('rejects invalid history query params', async () => {
    const streamChat = vi.fn(async () => new ReadableStream())
    const listThreadMessages = vi.fn(async () => [])
    const app = new Hono()
    registerChatRoute(app, {
      assistantRuntime: createAssistantRuntimeStub({
        streamChat,
        listThreadMessages
      })
    })

    const response = await app.request('http://localhost/chat/assistant-1/history')

    expect(response.status).toBe(400)
    expect(listThreadMessages).not.toHaveBeenCalled()
    expect(streamChat).not.toHaveBeenCalled()
  })

  it('returns 204 when there is no active stream to resume', async () => {
    const streamChat = vi.fn(async () => new ReadableStream())
    const listThreadMessages = vi.fn(async () => [])
    const app = new Hono()
    registerChatRoute(app, {
      assistantRuntime: createAssistantRuntimeStub({
        streamChat,
        listThreadMessages
      })
    })

    const response = await app.request(
      'http://localhost/chat/assistant-1/assistant-1:thread-1/stream'
    )

    expect(response.status).toBe(204)
  })

  it('resumes an active stream for the current chat id', async () => {
    let streamController: ReadableStreamDefaultController<unknown> | null = null
    const streamChat = vi.fn(
      async () =>
        new ReadableStream({
          start(controller) {
            streamController = controller as ReadableStreamDefaultController<unknown>
          }
        })
    )
    const listThreadMessages = vi.fn(async () => [])
    const app = new Hono()
    registerChatRoute(app, {
      assistantRuntime: createAssistantRuntimeStub({
        streamChat,
        listThreadMessages
      })
    })

    const streamResponse = await app.request('http://localhost/chat/assistant-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'assistant-1:thread-1',
        messages: [],
        threadId: 'thread-1',
        profileId: 'profile-1'
      })
    })
    expect(streamResponse.status).toBe(200)

    streamController!.enqueue({
      type: 'text-delta',
      id: 'message-1',
      delta: 'Hello'
    })

    const resumeResponse = await app.request(
      'http://localhost/chat/assistant-1/assistant-1:thread-1/stream'
    )
    expect(resumeResponse.status).toBe(200)

    const reader = resumeResponse.body?.getReader()
    expect(reader).toBeDefined()
    const firstChunk = await reader!.read()
    expect(firstChunk.done).toBe(false)
    const text = new TextDecoder().decode(firstChunk.value)
    expect(text).toContain('data:')

    await reader!.cancel()
    streamController!.close()
    await streamResponse.body?.cancel()
  })
})
