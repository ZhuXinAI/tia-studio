// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createProvider,
  listProviders,
  testProviderConnection,
  updateProvider
} from './providers-query'

describe('providers query local store', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('creates and updates providers without network calls', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch')

    const createdProvider = await createProvider({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'secret',
      selectedModel: 'gpt-5'
    })

    expect(createdProvider.name).toBe('OpenAI')
    expect(fetchSpy).not.toHaveBeenCalled()

    const updatedProvider = await updateProvider(createdProvider.id, {
      selectedModel: 'gpt-5-mini'
    })

    expect(updatedProvider?.selectedModel).toBe('gpt-5-mini')
    expect(fetchSpy).not.toHaveBeenCalled()

    const providers = await listProviders()
    expect(providers).toHaveLength(1)
    expect(providers[0].selectedModel).toBe('gpt-5-mini')
  })

  it('dispatches test connection event without sending network requests', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch')
    const listener = vi.fn()

    window.addEventListener('tia:provider:test-connection', listener)
    await testProviderConnection({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'secret',
      selectedModel: 'gpt-5'
    })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()

    window.removeEventListener('tia:provider:test-connection', listener)
  })
})
