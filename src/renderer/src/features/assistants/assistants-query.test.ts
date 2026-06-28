// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listAssistants } from './assistants-query'

describe('assistants query api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('lists assistants through backend api', async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json([
        {
          id: 'assistant-1',
          name: 'Workspace Agent'
        }
      ])
    )
    vi.stubGlobal('fetch', fetchSpy)

    await expect(listAssistants()).resolves.toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        name: 'Workspace Agent'
      })
    ])

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/assistants',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })
})
