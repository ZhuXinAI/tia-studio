// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAssistant } from './assistants-query'

describe('assistants query api client', () => {
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

  it('deletes assistant through backend api', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(null, {
        status: 204
      })
    )
    vi.stubGlobal('fetch', fetchSpy)

    await deleteAssistant('assistant-1')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/assistants/assistant-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })
})
