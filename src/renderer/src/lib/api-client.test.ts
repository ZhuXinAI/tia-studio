// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from './api-client'

describe('api client', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'test-token'
      }))
    }
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
})
