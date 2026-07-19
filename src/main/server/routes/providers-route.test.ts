import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerProvidersRoute } from './providers-route'

const savedProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  type: 'openai',
  apiKey: 'sk-full-saved-secret',
  apiHost: 'https://api.openai.com/v1',
  selectedModel: 'gpt-5',
  selectedModelContextWindowTokens: null,
  providerModels: null,
  enabled: true,
  supportsVision: false,
  isBuiltIn: false,
  isAdded: true,
  isDefault: true,
  icon: null,
  officialSite: null,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z'
}

describe('providers route', () => {
  it('returns the full saved API key for the local edit form', async () => {
    const app = new Hono()
    registerProvidersRoute(app, {
      providersRepo: {
        list: vi.fn(async () => [savedProvider])
      } as never
    })

    const response = await app.request('http://localhost/v1/providers', {
      headers: { Authorization: 'Bearer desktop-token' }
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ apiKey: 'sk-full-saved-secret' })
    ])
  })

  it('keeps provider credentials redacted for unauthenticated annotation requests', async () => {
    const app = new Hono()
    registerProvidersRoute(app, {
      providersRepo: {
        list: vi.fn(async () => [savedProvider])
      } as never
    })

    const response = await app.request('http://localhost/v1/providers')

    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ apiKey: '', hasApiKey: true })
    ])
  })
})
