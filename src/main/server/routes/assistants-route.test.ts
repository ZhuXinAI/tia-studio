import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { registerAssistantsRoute } from './assistants-route'

describe('assistants route', () => {
  let db: AppDatabase
  let app: Hono
  let providersRepo: ProvidersRepository
  let assistantsRepo: AssistantsRepository
  let threadsRepo: ThreadsRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    providersRepo = new ProvidersRepository(db)
    assistantsRepo = new AssistantsRepository(db)
    threadsRepo = new ThreadsRepository(db)
    app = new Hono()
    registerAssistantsRoute(app, { assistantsRepo, providersRepo })
  })

  afterEach(() => {
    db.close()
  })

  it('creates assistant when provider exists', async () => {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })

    const response = await app.request('http://localhost/v1/assistants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Trip Planner',
        providerId: provider.id,
        workspaceConfig: { root: '/tmp/workspace' }
      })
    })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.name).toBe('Trip Planner')
    expect(body.providerId).toBe(provider.id)
  })

  it('rejects assistant create when provider is unknown', async () => {
    const response = await app.request('http://localhost/v1/assistants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Trip Planner',
        providerId: 'missing-provider'
      })
    })

    expect(response.status).toBe(400)
  })

  it('updates assistant fields', async () => {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const createResponse = await app.request('http://localhost/v1/assistants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Trip Planner',
        providerId: provider.id
      })
    })
    const created = await createResponse.json()

    const patchResponse = await app.request(`http://localhost/v1/assistants/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructions: 'You are a helpful travel assistant.'
      })
    })

    expect(patchResponse.status).toBe(200)
    const patched = await patchResponse.json()
    expect(patched.instructions).toBe('You are a helpful travel assistant.')
  })

  it('deletes assistant and its threads', async () => {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistant = await assistantsRepo.create({
      name: 'Trip Planner',
      providerId: provider.id
    })
    await threadsRepo.create({
      assistantId: assistant.id,
      resourceId: 'resource-1',
      title: 'Thread one'
    })

    const response = await app.request(`http://localhost/v1/assistants/${assistant.id}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(204)
    await expect(assistantsRepo.getById(assistant.id)).resolves.toBeNull()
    await expect(threadsRepo.listByAssistant(assistant.id)).resolves.toEqual([])
  })

  it('returns 404 when deleting a missing assistant', async () => {
    const response = await app.request('http://localhost/v1/assistants/missing-assistant', {
      method: 'DELETE'
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Assistant not found'
    })
  })
})
