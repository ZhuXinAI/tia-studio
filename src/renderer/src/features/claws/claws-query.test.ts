// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveClawPairing,
  createClaw,
  createClawChannel,
  deleteClawChannel,
  getClawChannelAuthState,
  listClawPairings,
  listClaws
} from './claws-query'

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
            configuredChannels: [
              {
                id: 'channel-1',
                type: 'telegram',
                name: 'Ops Bot',
                assistantId: null,
                assistantName: null,
                status: 'disconnected',
                errorMessage: null,
                pairedCount: 0,
                pendingPairingCount: 0
              }
            ]
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    await expect(listClaws()).resolves.toMatchObject({
      configuredChannels: [expect.objectContaining({ id: 'channel-1' })]
    })

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

  it('creates a configured channel through backend api', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'channel-1',
            type: 'lark',
            name: 'Ops Lark',
            assistantId: null,
            assistantName: null,
            status: 'disconnected',
            errorMessage: null,
            pairedCount: 0,
            pendingPairingCount: 0
          }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    await createClawChannel({
      type: 'lark',
      name: 'Ops Lark',
      appId: 'cli_ops',
      appSecret: 'secret-ops'
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/claws/channels',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('deletes a configured channel through backend api', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchSpy)

    await deleteClawChannel('channel-1')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/claws/channels/channel-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('lists claw pairings through backend api', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            pairings: []
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    await listClawPairings('assistant-1')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/claws/assistant-1/pairings',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('loads whatsapp auth state through backend api', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            channelId: 'channel-whatsapp',
            channelType: 'whatsapp',
            status: 'qr_ready',
            qrCodeDataUrl: 'data:image/png;base64,qr',
            qrCodeValue: 'qr-value',
            phoneNumber: null,
            errorMessage: null,
            updatedAt: '2026-03-10T00:00:00.000Z'
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    await getClawChannelAuthState('assistant-1')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/claws/assistant-1/channel-auth',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('approves a claw pairing through backend api', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'pairing-1',
            status: 'approved'
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    await approveClawPairing('assistant-1', 'pairing-1')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/claws/assistant-1/pairings/pairing-1/approve',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })
})
