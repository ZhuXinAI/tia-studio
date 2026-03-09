// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAssistantHeartbeat, updateAssistantHeartbeat } from './assistant-heartbeat-query'

describe('assistant heartbeat query api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'test-token'
      })),
      pickDirectory: vi.fn(async () => null)
    }
  })

  it('loads assistant heartbeat through backend api', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'heartbeat-1',
            assistantId: 'assistant-1',
            enabled: true,
            intervalMinutes: 30,
            prompt: 'Review recent work logs and recent conversations. Follow up only if needed.',
            threadId: 'thread-1',
            lastRunAt: null,
            nextRunAt: null,
            lastRunStatus: null,
            lastError: null,
            createdAt: '2026-03-10T00:00:00.000Z',
            updatedAt: '2026-03-10T00:00:00.000Z'
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    const heartbeat = await getAssistantHeartbeat('assistant-1')

    expect(heartbeat).toMatchObject({
      assistantId: 'assistant-1',
      enabled: true,
      intervalMinutes: 30
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/assistants/assistant-1/heartbeat',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('updates assistant heartbeat through backend api', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'heartbeat-1',
            assistantId: 'assistant-1',
            enabled: true,
            intervalMinutes: 45,
            prompt: 'Review recent work and recent conversations every 45 minutes.',
            threadId: 'thread-1',
            lastRunAt: null,
            nextRunAt: null,
            lastRunStatus: null,
            lastError: null,
            createdAt: '2026-03-10T00:00:00.000Z',
            updatedAt: '2026-03-10T00:00:00.000Z'
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    await updateAssistantHeartbeat('assistant-1', {
      enabled: true,
      intervalMinutes: 45,
      prompt: 'Review recent work and recent conversations every 45 minutes.'
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/assistants/assistant-1/heartbeat',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        }),
        body: JSON.stringify({
          enabled: true,
          intervalMinutes: 45,
          prompt: 'Review recent work and recent conversations every 45 minutes.'
        })
      })
    )
  })
})
