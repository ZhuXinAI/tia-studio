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
