// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createProvider,
  deleteProvider,
  listProviders,
  providerConnectionEventName,
  testProviderConnection,
  updateProvider
} from './providers-query'

function createProviderRecord(id: string) {
  return {
    id,
    name: 'OpenAI',
    type: 'openai' as const,
    apiKey: 'secret',
    apiHost: 'https://api.openai.com/v1',
    selectedModel: 'gpt-5',
    providerModels: null,
    enabled: true,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z'
  }
}

describe('providers query api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'test-token'
      })),
      pickDirectory: vi.fn(async () => null)
    }
  })

  it('lists providers from backend api', async () => {
    const responseBody = [createProviderRecord('provider-1')]
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    )
    vi.stubGlobal('fetch', fetchSpy)

    const providers = await listProviders()

    expect(providers).toEqual(responseBody)
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/providers',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('returns first provider response when backend already has providers', async () => {
    const responseBody = [createProviderRecord('provider-1')]
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockRejectedValueOnce(new Error('second request should not run'))
    vi.stubGlobal('fetch', fetchSpy)

    const providers = await listProviders()

    expect(providers).toEqual(responseBody)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('creates, updates, and deletes providers through backend api', async () => {
    const created = createProviderRecord('provider-1')
    const updated = {
      ...created,
      selectedModel: 'gpt-5-mini'
    }

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(updated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 204
        })
      )
    vi.stubGlobal('fetch', fetchSpy)

    const createdProvider = await createProvider({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'secret',
      selectedModel: 'gpt-5'
    })

    expect(createdProvider.selectedModel).toBe('gpt-5')
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:4769/v1/providers',
      expect.objectContaining({
        method: 'POST'
      })
    )

    const updatedProvider = await updateProvider(createdProvider.id, {
      selectedModel: 'gpt-5-mini'
    })

    expect(updatedProvider.selectedModel).toBe('gpt-5-mini')
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:4769/v1/providers/provider-1',
      expect.objectContaining({
        method: 'PATCH'
      })
    )

    await deleteProvider(createdProvider.id)

    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:4769/v1/providers/provider-1',
      expect.objectContaining({
        method: 'DELETE'
      })
    )
  })

  it('migrates legacy local providers when backend store is empty', async () => {
    window.localStorage.setItem(
      'tia.providers.v1',
      JSON.stringify([
        {
          id: 'legacy-provider-1',
          name: 'Legacy OpenAI',
          type: 'openai',
          apiKey: 'legacy-secret',
          apiHost: 'https://api.openai.com/v1',
          selectedModel: 'gpt-5',
          providerModels: null,
          enabled: true,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        }
      ])
    )

    const migratedProvider = createProviderRecord('provider-legacy')
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(migratedProvider), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([migratedProvider]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    vi.stubGlobal('fetch', fetchSpy)

    const providers = await listProviders()

    expect(providers).toEqual([migratedProvider])
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:4769/v1/providers',
      expect.objectContaining({
        method: 'POST'
      })
    )
    expect(window.localStorage.getItem('tia.providers.v1')).toBeNull()
  })

  it('tests connection via backend api and dispatches local event', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    )
    vi.stubGlobal('fetch', fetchSpy)
    const listener = vi.fn()

    window.addEventListener(providerConnectionEventName, listener)

    await testProviderConnection({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'secret',
      selectedModel: 'gpt-5'
    })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4769/v1/providers/test-connection',
      expect.objectContaining({
        method: 'POST'
      })
    )
    window.removeEventListener(providerConnectionEventName, listener)
  })

  it('throws provider error when connection check fails', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'Invalid API key' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    )
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      testProviderConnection({
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'bad-key',
        selectedModel: 'gpt-5'
      })
    ).rejects.toThrow('Invalid API key')
  })
})
