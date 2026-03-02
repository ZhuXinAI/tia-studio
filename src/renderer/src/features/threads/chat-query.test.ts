// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDesktopChatFetch,
  listThreadChatMessages,
  resolveDesktopChatUrl
} from './chat-query'

describe('chat query', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'chat-token'
      })),
      pickDirectory: vi.fn(async () => null)
    }
  })

  it('resolves relative chat paths against desktop base url', () => {
    expect(resolveDesktopChatUrl('http://127.0.0.1:4769', '/chat/assistant-1')).toBe(
      'http://127.0.0.1:4769/chat/assistant-1'
    )
  })

  it('attaches bearer auth header when proxying chat requests', async () => {
    const fetchSpy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('ok', { status: 200 })
    )
    vi.stubGlobal('fetch', fetchSpy)
    const chatFetch = createDesktopChatFetch()

    await chatFetch('/chat/assistant-1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{}'
    })

    const requestInit = fetchSpy.mock.calls[0]?.[1]
    const requestHeaders = new Headers(requestInit?.headers)

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/chat/assistant-1',
      expect.objectContaining({
        method: 'POST'
      })
    )
    expect(requestHeaders.get('Authorization')).toBe('Bearer chat-token')
  })

  it('loads thread history through the authenticated desktop proxy', async () => {
    const responseBody = [
      {
        id: 'msg-user',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }]
      }
    ]
    const fetchSpy = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () =>
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    vi.stubGlobal('fetch', fetchSpy)

    const messages = await listThreadChatMessages({
      assistantId: 'assistant-1',
      threadId: 'thread-1',
      profileId: 'profile-1'
    })

    expect(messages).toEqual(responseBody)
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/chat/assistant-1/history?threadId=thread-1&profileId=profile-1',
      expect.objectContaining({
        method: 'GET'
      })
    )
  })
})
