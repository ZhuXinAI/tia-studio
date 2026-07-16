import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import type { AppDatabase } from '../../persistence/client'
import { registerProvidersRoute } from './providers-route'

describe('providers route', () => {
  let db: AppDatabase
  let app: Hono
  let providersRepo: ProvidersRepository
  let assistantsRepo: AssistantsRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    providersRepo = new ProvidersRepository(db)
    assistantsRepo = new AssistantsRepository(db)
    app = new Hono()
    registerProvidersRoute(app, { providersRepo, assistantsRepo })
  })

  afterEach(() => {
    db.close()
  })

  it('creates provider with selected model', async () => {
    const response = await app.request('http://localhost/v1/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'test-key',
        apiHost: 'https://api.openai.com/v1',
        selectedModel: 'gpt-5'
      })
    })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.type).toBe('openai')
    expect(body.selectedModel).toBe('gpt-5')
    expect(body.selectedModelContextWindowTokens).toBe(400000)
  })

  it('rejects provider when selected model is missing', async () => {
    const response = await app.request('http://localhost/v1/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'test-key'
      })
    })

    expect(response.status).toBe(400)
  })

  it('persists optional providerModels list', async () => {
    const response = await app.request('http://localhost/v1/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'MiniMax',
        type: 'openai',
        apiKey: 'test-key',
        selectedModel: 'MiniMax-M2.5',
        providerModels: ['MiniMax-M2.5', 'MiniMax-M2.5-lightning']
      })
    })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.providerModels).toEqual(['MiniMax-M2.5', 'MiniMax-M2.5-lightning'])
  })

  it('derives exact per-model context limits from known provider presets', async () => {
    const response = await app.request('http://localhost/v1/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'test-key',
        selectedModel: 'gpt-5',
        providerModels: ['gpt-5-mini', 'custom-model']
      })
    })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.modelContextWindowTokensByModel).toEqual({
      'gpt-5': 400000,
      'gpt-5-mini': 400000
    })
  })

  it('creates ACP providers without an API key', async () => {
    const response = await app.request('http://localhost/v1/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Codex ACP',
        type: 'codex-acp',
        apiKey: '',
        selectedModel: 'default'
      })
    })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.type).toBe('codex-acp')
    expect(body.apiKey).toBe('')
    expect(body.selectedModel).toBe('default')
  })

  it('returns successful provider connection check', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'gpt-5' }]
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    const response = await app.request('http://localhost/v1/providers/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'openai',
        apiKey: 'test-key',
        selectedModel: 'gpt-5'
      })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('checks openrouter providers against the OpenRouter models endpoint', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'openai/gpt-4o' }]
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    const response = await app.request('http://localhost/v1/providers/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'openrouter',
        apiKey: 'test-key',
        selectedModel: 'openai/gpt-4o'
      })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-key'
        }
      })
    )
  })

  it('returns failed provider connection check with message', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: 'Invalid API key' }
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)

    const response = await app.request('http://localhost/v1/providers/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'openai',
        apiKey: 'bad-key',
        selectedModel: 'gpt-5'
      })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid API key'
    })
  })

  it('returns a clear ACP provider connection error when the runtime is missing', async () => {
    const acpApp = new Hono()
    registerProvidersRoute(acpApp, {
      providersRepo,
      assistantsRepo,
      getManagedRuntimeStatus: vi.fn(async () => ({
        'codex-acp': {
          status: 'missing',
          binaryPath: null,
          errorMessage: null
        }
      }))
    })

    const response = await acpApp.request('http://localhost/v1/providers/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'codex-acp',
        apiKey: '',
        selectedModel: 'default'
      })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Codex ACP runtime is not ready. Install or activate it in Settings > Coding.'
    })
  })

  it('accepts ACP provider connection checks when the managed runtime is ready', async () => {
    const acpApp = new Hono()
    registerProvidersRoute(acpApp, {
      providersRepo,
      assistantsRepo,
      getManagedRuntimeStatus: vi.fn(async () => ({
        'codex-acp': {
          status: 'ready',
          binaryPath: '/managed/codex-acp',
          errorMessage: null
        }
      }))
    })

    const response = await acpApp.request('http://localhost/v1/providers/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'codex-acp',
        apiKey: '',
        selectedModel: 'default'
      })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('deletes provider when no assistants reference it', async () => {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })

    const response = await app.request(`http://localhost/v1/providers/${provider.id}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(204)
    await expect(providersRepo.getById(provider.id)).resolves.toBeNull()
  })

  it('removes built-in preset providers from the added list instead of deleting the preset row', async () => {
    const provider = await providersRepo.create({
      id: 'built-in-minimax',
      name: 'MiniMax',
      type: 'anthropic',
      apiKey: 'test-key',
      apiHost: 'https://api.minimaxi.com/anthropic/v1',
      selectedModel: 'MiniMax-M2.7',
      enabled: true,
      isBuiltIn: true,
      isAdded: true,
      isDefault: true
    })

    const response = await app.request(`http://localhost/v1/providers/${provider.id}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(204)
    await expect(providersRepo.getById(provider.id)).resolves.toMatchObject({
      id: provider.id,
      enabled: false,
      isAdded: false,
      isDefault: false
    })
  })

  it('rejects provider deletion when assistants still reference it', async () => {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    await assistantsRepo.create({
      name: 'Trip Planner',
      providerId: provider.id,
      workspaceConfig: {
        rootPath: '/tmp/workspace'
      }
    })

    const response = await app.request(`http://localhost/v1/providers/${provider.id}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Provider is assigned to one or more assistants'
    })
    await expect(providersRepo.getById(provider.id)).resolves.not.toBeNull()
  })
})
