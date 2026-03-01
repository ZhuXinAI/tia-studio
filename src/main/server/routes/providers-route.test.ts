import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateAppSchema } from '../../persistence/migrate'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import type { AppDatabase } from '../../persistence/client'
import { registerProvidersRoute } from './providers-route'

describe('providers route', () => {
  let db: AppDatabase
  let app: Hono

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    const providersRepo = new ProvidersRepository(db)
    app = new Hono()
    registerProvidersRoute(app, { providersRepo })
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
})
