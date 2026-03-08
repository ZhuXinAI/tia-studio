// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClaw, listClaws } from './claws-query'

describe('claws query api client', () => {
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

  it('lists claws through backend api', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            claws: [],
            availableChannels: []
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    await listClaws()

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/claws',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('creates a claw through backend api', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'assistant-1',
            name: 'Ops Assistant',
            description: '',
            instructions: 'Handle ops.',
            providerId: 'provider-1',
            enabled: true,
            channel: null
          }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    await createClaw({
      assistant: {
        name: 'Ops Assistant',
        providerId: 'provider-1',
        instructions: 'Handle ops.',
        enabled: true
      },
      channel: {
        mode: 'create',
        type: 'lark',
        name: 'Ops Lark',
        appId: 'cli_ops',
        appSecret: 'secret-ops'
      }
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/claws',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })
})
