import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { ThreadUsageRepository } from '../../persistence/repos/thread-usage-repo'
import { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { registerThreadsRoute } from './threads-route'

describe('threads route', () => {
  let db: AppDatabase
  let app: Hono
  let assistantsRepo: AssistantsRepository
  let providersRepo: ProvidersRepository
  let threadsRepo: ThreadsRepository
  let threadUsageRepo: ThreadUsageRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    assistantsRepo = new AssistantsRepository(db)
    providersRepo = new ProvidersRepository(db)
    threadsRepo = new ThreadsRepository(db)
    threadUsageRepo = new ThreadUsageRepository(db)
    app = new Hono()
    registerThreadsRoute(app, {
      threadsRepo,
      assistantsRepo,
      threadUsageRepo
    })
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

  it('returns persisted usage totals with each thread response', async () => {
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
    const thread = await threadsRepo.create({
      assistantId: assistant.id,
      resourceId: 'profile-default',
      title: 'Plan my Sanya trip'
    })

    await threadUsageRepo.recordMessageUsage({
      messageId: 'msg-1',
      threadId: thread.id,
      assistantId: assistant.id,
      resourceId: 'profile-default',
      providerId: provider.id,
      model: 'gpt-5',
      source: 'chat',
      usage: {
        inputTokens: 1000,
        outputTokens: 320,
        totalTokens: 1320,
        reasoningTokens: 90,
        cachedInputTokens: 210
      },
      stepCount: 2,
      finishReason: 'stop',
      createdAt: '2026-03-14T00:00:00.000Z'
    })

    const listResponse = await app.request(
      `http://localhost/v1/threads?assistantId=${assistant.id}`
    )

    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: thread.id,
        title: 'Plan my Sanya trip',
        usageTotals: {
          assistantMessageCount: 1,
          inputTokens: 1000,
          outputTokens: 320,
          totalTokens: 1320,
          reasoningTokens: 90,
          cachedInputTokens: 210
        }
      })
    ])
  })

  it('accepts empty titles when creating threads', async () => {
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
        title: ''
      })
    })

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created.title).toBe('')
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

  it('accepts empty titles when updating threads', async () => {
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
        title: 'Temp title'
      })
    })
    const created = await createResponse.json()

    const patchResponse = await app.request(`http://localhost/v1/threads/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: ''
      })
    })

    expect(patchResponse.status).toBe(200)
    const patched = await patchResponse.json()
    expect(patched.title).toBe('')
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

  it('excludes hidden system threads by default and includes them on demand', async () => {
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

    const visibleThread = await threadsRepo.create({
      assistantId: assistant.id,
      resourceId: 'profile-default',
      title: 'Visible chat'
    })
    const hiddenCronThread = await threadsRepo.create({
      assistantId: assistant.id,
      resourceId: 'profile-default',
      title: 'Daily cron',
      metadata: {
        system: true,
        systemType: 'cron',
        cronJobId: 'cron-job-1'
      }
    })
    const hiddenHeartbeatThread = await threadsRepo.create({
      assistantId: assistant.id,
      resourceId: 'profile-default',
      title: 'Heartbeat',
      metadata: {
        system: true,
        systemType: 'heartbeat',
        heartbeatId: 'heartbeat-1'
      }
    })

    const defaultListResponse = await app.request(
      `http://localhost/v1/threads?assistantId=${assistant.id}`
    )

    expect(defaultListResponse.status).toBe(200)
    await expect(defaultListResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: visibleThread.id,
        title: 'Visible chat'
      })
    ])

    const includeHiddenResponse = await app.request(
      `http://localhost/v1/threads?assistantId=${assistant.id}&includeHidden=true`
    )

    expect(includeHiddenResponse.status).toBe(200)
    const includeHiddenBody = await includeHiddenResponse.json()
    expect(includeHiddenBody).toHaveLength(3)
    expect(includeHiddenBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: hiddenCronThread.id,
          metadata: {
            system: true,
            systemType: 'cron',
            cronJobId: 'cron-job-1'
          }
        }),
        expect.objectContaining({
          id: hiddenHeartbeatThread.id,
          metadata: {
            system: true,
            systemType: 'heartbeat',
            heartbeatId: 'heartbeat-1'
          }
        }),
        expect.objectContaining({
          id: visibleThread.id
        })
      ])
    )
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
