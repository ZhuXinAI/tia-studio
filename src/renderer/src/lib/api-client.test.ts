// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from './api-client'

describe('api client', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('includes bearer auth header on requests', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const client = createApiClient()
    await client.post('/v1/providers', {
      name: 'OpenAI'
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/providers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('parses structured JSON request errors into user-facing messages', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'Assistant workspace is not configured' }), {
          status: 409,
          headers: {
            'Content-Type': 'application/json'
          }
        })
    )
    vi.stubGlobal('fetch', fetchSpy)

    const client = createApiClient()

    await expect(client.get('/v1/threads')).rejects.toThrow(
      'Assistant workspace is not configured (status 409)'
    )
  })
})
