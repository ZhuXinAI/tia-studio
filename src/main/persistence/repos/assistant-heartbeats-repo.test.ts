import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { AssistantHeartbeatsRepository } from './assistant-heartbeats-repo'
import { ProvidersRepository } from './providers-repo'
import { ThreadsRepository } from './threads-repo'

describe('AssistantHeartbeatsRepository', () => {
  let db: AppDatabase
  let repo: AssistantHeartbeatsRepository
  let assistantId: string
  let threadId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new AssistantHeartbeatsRepository(db)

    const providersRepo = new ProvidersRepository(db)
    const assistantsRepo = new AssistantsRepository(db)
    const threadsRepo = new ThreadsRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistant = await assistantsRepo.create({
      name: 'Heartbeat Assistant',
      providerId: provider.id
    })

    assistantId = assistant.id
    threadId = (
      await threadsRepo.create({
        assistantId,
        resourceId: 'profile-default',
        title: 'Heartbeat backing thread'
      })
    ).id
  })

  afterEach(() => {
    db.close()
  })

  it('upserts heartbeat config per assistant and updates persisted fields', async () => {
    const created = await repo.upsertForAssistant({
      assistantId,
      enabled: true,
      intervalMinutes: 30,
      prompt: 'Check recent work and follow up if needed.',
      threadId
    })

    expect(created).toMatchObject({
      assistantId,
      enabled: true,
      intervalMinutes: 30,
      prompt: 'Check recent work and follow up if needed.',
      threadId,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
      lastError: null
    })
    await expect(repo.getByAssistantId(assistantId)).resolves.toMatchObject({
      id: created.id,
      assistantId,
      threadId
    })

    const updated = await repo.upsertForAssistant({
      assistantId,
      enabled: false,
      intervalMinutes: 60,
      prompt: 'Check the last hour of work.',
      threadId: null,
      lastRunAt: '2026-03-10T00:00:00.000Z',
      nextRunAt: '2026-03-10T01:00:00.000Z',
      lastRunStatus: 'failed',
      lastError: 'Workspace root missing'
    })

    expect(updated).toMatchObject({
      id: created.id,
      assistantId,
      enabled: false,
      intervalMinutes: 60,
      prompt: 'Check the last hour of work.',
      threadId: null,
      lastRunAt: '2026-03-10T00:00:00.000Z',
      nextRunAt: '2026-03-10T01:00:00.000Z',
      lastRunStatus: 'failed',
      lastError: 'Workspace root missing'
    })

    const patched = await repo.update(created.id, {
      enabled: true,
      lastRunStatus: 'success',
      lastError: null
    })

    expect(patched).toMatchObject({
      id: created.id,
      enabled: true,
      lastRunStatus: 'success',
      lastError: null
    })
    await expect(repo.list()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        assistantId,
        enabled: true,
        intervalMinutes: 60,
        prompt: 'Check the last hour of work.',
        threadId: null,
        lastRunStatus: 'success',
        lastError: null
      })
    ])
  })
})
