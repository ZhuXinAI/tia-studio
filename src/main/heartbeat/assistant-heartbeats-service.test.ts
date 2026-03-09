import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../persistence/client'
import { migrateAppSchema } from '../persistence/migrate'
import { AssistantsRepository } from '../persistence/repos/assistants-repo'
import { AssistantHeartbeatsRepository } from '../persistence/repos/assistant-heartbeats-repo'
import { ProvidersRepository } from '../persistence/repos/providers-repo'
import { ThreadsRepository } from '../persistence/repos/threads-repo'
import {
  AssistantHeartbeatsService,
  AssistantHeartbeatsServiceError
} from './assistant-heartbeats-service'

describe('AssistantHeartbeatsService', () => {
  let db: AppDatabase
  let assistantsRepo: AssistantsRepository
  let providersRepo: ProvidersRepository
  let threadsRepo: ThreadsRepository
  let heartbeatsRepo: AssistantHeartbeatsRepository
  let reloadScheduler: ReturnType<typeof vi.fn<() => Promise<void>>>
  let service: AssistantHeartbeatsService

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    assistantsRepo = new AssistantsRepository(db)
    providersRepo = new ProvidersRepository(db)
    threadsRepo = new ThreadsRepository(db)
    heartbeatsRepo = new AssistantHeartbeatsRepository(db)
    reloadScheduler = vi.fn(async (): Promise<void> => undefined)
    service = new AssistantHeartbeatsService({
      assistantsRepo,
      heartbeatsRepo,
      threadsRepo,
      reloadScheduler
    })
  })

  afterEach(() => {
    db.close()
  })

  async function createAssistant(name: string, workspaceConfig?: Record<string, unknown>) {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })

    return assistantsRepo.create({
      name,
      providerId: provider.id,
      workspaceConfig
    })
  }

  it('creates and updates heartbeat config, provisions a hidden thread, and reloads the scheduler', async () => {
    const assistant = await createAssistant('Heartbeat Assistant', {
      rootPath: '/tmp/workspace-a'
    })

    const created = await service.upsertHeartbeat({
      assistantId: assistant.id,
      enabled: true,
      intervalMinutes: 30,
      prompt: 'Review the last 30 minutes of work and conversations.'
    })

    expect(created).toMatchObject({
      assistantId: assistant.id,
      enabled: true,
      intervalMinutes: 30,
      prompt: 'Review the last 30 minutes of work and conversations.',
      threadId: expect.any(String)
    })
    await expect(threadsRepo.getById(created.threadId ?? '')).resolves.toMatchObject({
      assistantId: assistant.id,
      metadata: {
        system: true,
        systemType: 'heartbeat',
        heartbeatId: created.id
      }
    })
    expect(reloadScheduler).toHaveBeenCalledTimes(1)

    const updated = await service.upsertHeartbeat({
      assistantId: assistant.id,
      enabled: false,
      intervalMinutes: 60,
      prompt: 'Review the last hour of work and conversations.'
    })

    expect(updated).toMatchObject({
      id: created.id,
      assistantId: assistant.id,
      enabled: false,
      intervalMinutes: 60,
      prompt: 'Review the last hour of work and conversations.',
      threadId: created.threadId
    })
    expect(reloadScheduler).toHaveBeenCalledTimes(2)
  })

  it('rejects heartbeat config when the assistant does not exist', async () => {
    await expect(
      service.upsertHeartbeat({
        assistantId: 'missing-assistant',
        enabled: true,
        intervalMinutes: 30,
        prompt: 'Review recent work.'
      })
    ).rejects.toEqual(
      new AssistantHeartbeatsServiceError(404, 'assistant_not_found', 'Assistant not found')
    )
    expect(reloadScheduler).not.toHaveBeenCalled()
  })

  it('rejects heartbeat config when the assistant lacks a workspace root', async () => {
    const assistant = await createAssistant('No Workspace Assistant', {})

    await expect(
      service.upsertHeartbeat({
        assistantId: assistant.id,
        enabled: true,
        intervalMinutes: 30,
        prompt: 'Review recent work.'
      })
    ).rejects.toEqual(
      new AssistantHeartbeatsServiceError(
        400,
        'assistant_workspace_required',
        'Assistant workspace is required for heartbeat'
      )
    )
    expect(reloadScheduler).not.toHaveBeenCalled()
  })

  it('repairs the hidden heartbeat thread when the stored thread is missing', async () => {
    const assistant = await createAssistant('Repair Assistant', {
      rootPath: '/tmp/workspace-b'
    })
    const created = await service.upsertHeartbeat({
      assistantId: assistant.id,
      enabled: true,
      intervalMinutes: 30,
      prompt: 'Review recent work.'
    })

    await threadsRepo.delete(created.threadId ?? '')

    const repaired = await service.upsertHeartbeat({
      assistantId: assistant.id,
      enabled: true,
      intervalMinutes: 45,
      prompt: 'Review recent work and conversations.'
    })

    expect(repaired.threadId).toEqual(expect.any(String))
    expect(repaired.threadId).not.toBe(created.threadId)
    await expect(threadsRepo.getById(repaired.threadId ?? '')).resolves.toMatchObject({
      assistantId: assistant.id,
      metadata: {
        system: true,
        systemType: 'heartbeat',
        heartbeatId: created.id
      }
    })
    expect(reloadScheduler).toHaveBeenCalledTimes(2)
  })
})
