// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createChannel,
  deleteChannel,
  listChannels,
  recoverChannelSetup,
  updateChannel
} from './channels-query'

describe('settings channels query api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('lists configured channels through backend api', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
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
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    await expect(listChannels()).resolves.toEqual([expect.objectContaining({ id: 'channel-1' })])

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/channels',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('creates, updates, recovers, and deletes configured channels through backend api', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'

      if (method === 'POST' && String(_input).endsWith('/v1/channels')) {
        return new Response(
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
      }

      if (method === 'PATCH') {
        return new Response(
          JSON.stringify({
            id: 'channel-1',
            type: 'lark',
            name: 'Ops Lark Updated',
            assistantId: null,
            assistantName: null,
            status: 'disconnected',
            errorMessage: null,
            pairedCount: 0,
            pendingPairingCount: 0
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      if (method === 'POST' && String(_input).endsWith('/recover')) {
        return new Response(
          JSON.stringify({
            id: 'channel-1',
            type: 'lark',
            name: 'Ops Lark Updated',
            assistantId: null,
            assistantName: null,
            status: 'connected',
            errorMessage: null,
            pairedCount: 0,
            pendingPairingCount: 0
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchSpy)

    await createChannel({
      type: 'lark',
      name: 'Ops Lark',
      appId: 'cli_ops',
      appSecret: 'secret-ops'
    })
    await updateChannel('channel-1', {
      type: 'lark',
      name: 'Ops Lark Updated',
      appId: 'cli_updated'
    })
    await recoverChannelSetup('channel-1')
    await deleteChannel('channel-1')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/channels',
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/channels/channel-1',
      expect.objectContaining({ method: 'PATCH' })
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/channels/channel-1/recover',
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/channels/channel-1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})
