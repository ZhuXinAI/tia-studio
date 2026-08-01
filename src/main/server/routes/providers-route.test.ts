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
  supportsThinking: true,
  thinkingOnly: false,
  allowsThinkingOff: true,
  defaultThinkingLevel: 'medium',
  supportedThinkingLevels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
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

  it('returns the generated smoke-test reply', async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      return new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const app = new Hono()
    registerProvidersRoute(app, {
      providersRepo: {
        list: vi.fn(async () => []),
        getById: vi.fn(async () => null)
      } as never
    })

    const response = await app.request('http://localhost/v1/providers/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'openai',
        apiKey: 'sk-test',
        apiHost: 'https://provider.test/v1',
        selectedModel: 'gpt-test'
      })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, reply: 'hi' })
  })
})
