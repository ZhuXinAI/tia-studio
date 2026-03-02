import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { registerThreadsRoute } from './threads-route'

describe('threads route', () => {
  let db: AppDatabase
  let app: Hono
  let assistantsRepo: AssistantsRepository
  let providersRepo: ProvidersRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    assistantsRepo = new AssistantsRepository(db)
    providersRepo = new ProvidersRepository(db)
    const threadsRepo = new ThreadsRepository(db)
    app = new Hono()
    registerThreadsRoute(app, { threadsRepo, assistantsRepo })
  })

  afterEach(() => {
    db.close()
  })

  it('creates and lists threads by assistant', async () => {
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

    const createResponse = await app.request('http://localhost/v1/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: assistant.id,
        resourceId: 'profile-default',
        title: 'Plan my Sanya trip'
      })
    })

    expect(createResponse.status).toBe(201)

    const listResponse = await app.request(
      `http://localhost/v1/threads?assistantId=${assistant.id}`
    )
    expect(listResponse.status).toBe(200)
    const listBody = await listResponse.json()
    expect(listBody).toHaveLength(1)
    expect(listBody[0].title).toBe('Plan my Sanya trip')
  })

  it('updates thread title', async () => {
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
    const createResponse = await app.request('http://localhost/v1/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: assistant.id,
        resourceId: 'profile-default',
        title: 'Old title'
      })
    })
    const created = await createResponse.json()

    const patchResponse = await app.request(`http://localhost/v1/threads/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'New title'
      })
    })

    expect(patchResponse.status).toBe(200)
    const patched = await patchResponse.json()
    expect(patched.title).toBe('New title')
  })

  it('deletes thread by id', async () => {
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
    const createResponse = await app.request('http://localhost/v1/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: assistant.id,
        resourceId: 'profile-default',
        title: 'Delete me'
      })
    })
    const created = await createResponse.json()

    const deleteResponse = await app.request(`http://localhost/v1/threads/${created.id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(204)

    const listResponse = await app.request(
      `http://localhost/v1/threads?assistantId=${assistant.id}`
    )
    const listBody = await listResponse.json()
    expect(listBody).toEqual([])
  })

  it('returns 404 when deleting missing thread', async () => {
    const response = await app.request('http://localhost/v1/threads/missing-thread', {
      method: 'DELETE'
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Thread not found'
    })
  })
})
