import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantHeartbeatsRepository } from '../../persistence/repos/assistant-heartbeats-repo'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { registerAssistantHeartbeatRoute } from './assistant-heartbeat-route'

describe('assistant heartbeat route', () => {
  let db: AppDatabase
  let app: Hono
  let assistantsRepo: AssistantsRepository
  let providersRepo: ProvidersRepository
  let threadsRepo: ThreadsRepository
  let heartbeatsRepo: AssistantHeartbeatsRepository
  let schedulerReload: ReturnType<typeof vi.fn<() => Promise<void>>>

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    assistantsRepo = new AssistantsRepository(db)
    providersRepo = new ProvidersRepository(db)
    threadsRepo = new ThreadsRepository(db)
    heartbeatsRepo = new AssistantHeartbeatsRepository(db)
    schedulerReload = vi.fn(async (): Promise<void> => undefined)
    app = new Hono()
    registerAssistantHeartbeatRoute(app, {
      assistantsRepo,
      threadsRepo,
      heartbeatsRepo,
      heartbeatSchedulerService: {
        reload: schedulerReload
      }
    })
  })

  afterEach(() => {
    db.close()
  })

  async function createWorkspaceAssistant(name: string, rootPath: string) {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })

    return assistantsRepo.create({
      name,
      providerId: provider.id,
      workspaceConfig: {
        rootPath
      }
    })
  }

  it('returns the current heartbeat config for an assistant', async () => {
    const assistant = await createWorkspaceAssistant('Heartbeat Assistant', '/tmp/workspace-a')
    const hiddenThread = await threadsRepo.create({
      assistantId: assistant.id,
      resourceId: 'default-profile',
      title: 'Heartbeat',
      metadata: {
        system: true,
        systemType: 'heartbeat'
      }
    })
    const heartbeat = await heartbeatsRepo.upsertForAssistant({
      assistantId: assistant.id,
      enabled: true,
      intervalMinutes: 30,
      prompt: 'Review recent work logs and recent conversations. Follow up only if needed.',
      threadId: hiddenThread.id
    })

    const response = await app.request(`http://localhost/v1/assistants/${assistant.id}/heartbeat`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(heartbeat)
  })

  it('creates a heartbeat config, repairs the hidden thread, and reloads the scheduler', async () => {
    const assistant = await createWorkspaceAssistant('Heartbeat Assistant', '/tmp/workspace-a')

    const createResponse = await app.request(
      `http://localhost/v1/assistants/${assistant.id}/heartbeat`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          intervalMinutes: 30,
          prompt: 'Review recent work logs and recent conversations. Follow up only if needed.'
        })
      }
    )

    expect(createResponse.status).toBe(200)
    const created = await createResponse.json()
    expect(created).toMatchObject({
      assistantId: assistant.id,
      enabled: true,
      intervalMinutes: 30,
      prompt: 'Review recent work logs and recent conversations. Follow up only if needed.',
      threadId: expect.any(String)
    })
    await expect(threadsRepo.getById(created.threadId)).resolves.toMatchObject({
      assistantId: assistant.id,
      metadata: {
        system: true,
        systemType: 'heartbeat',
        heartbeatId: created.id
      }
    })

    const updateResponse = await app.request(
      `http://localhost/v1/assistants/${assistant.id}/heartbeat`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: false,
          intervalMinutes: 45,
          prompt: 'Check recent work and stay quiet unless a follow-up is helpful.'
        })
      }
    )

    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: created.id,
      assistantId: assistant.id,
      enabled: false,
      intervalMinutes: 45,
      prompt: 'Check recent work and stay quiet unless a follow-up is helpful.',
      threadId: created.threadId
    })
    expect(schedulerReload).toHaveBeenCalledTimes(2)
  })

  it('rejects unknown assistants', async () => {
    const response = await app.request(
      'http://localhost/v1/assistants/missing-assistant/heartbeat',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          intervalMinutes: 30,
          prompt: 'Review recent work logs and recent conversations. Follow up only if needed.'
        })
      }
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Assistant not found'
    })
  })

  it('rejects invalid heartbeat intervals', async () => {
    const assistant = await createWorkspaceAssistant('Heartbeat Assistant', '/tmp/workspace-a')

    const response = await app.request(`http://localhost/v1/assistants/${assistant.id}/heartbeat`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        intervalMinutes: 0,
        prompt: 'Review recent work logs and recent conversations. Follow up only if needed.'
      })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Heartbeat interval must be at least 1 minute'
    })
    expect(schedulerReload).not.toHaveBeenCalled()
  })
})
