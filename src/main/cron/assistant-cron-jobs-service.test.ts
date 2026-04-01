import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../persistence/client'
import { migrateAppSchema } from '../persistence/migrate'
import { AssistantsRepository } from '../persistence/repos/assistants-repo'
import { CronJobsRepository } from '../persistence/repos/cron-jobs-repo'
import { ProvidersRepository } from '../persistence/repos/providers-repo'
import { ThreadsRepository } from '../persistence/repos/threads-repo'
import { AssistantCronJobsService } from './assistant-cron-jobs-service'

describe('AssistantCronJobsService', () => {
  let db: AppDatabase
  let assistantsRepo: AssistantsRepository
  let providersRepo: ProvidersRepository
  let threadsRepo: ThreadsRepository
  let cronJobsRepo: CronJobsRepository
  let reloadScheduler: ReturnType<typeof vi.fn<() => Promise<void>>>
  let service: AssistantCronJobsService

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    assistantsRepo = new AssistantsRepository(db)
    providersRepo = new ProvidersRepository(db)
    threadsRepo = new ThreadsRepository(db)
    cronJobsRepo = new CronJobsRepository(db)
    reloadScheduler = vi.fn(async (): Promise<void> => undefined)
    service = new AssistantCronJobsService({
      assistantsRepo,
      cronJobsRepo,
      threadsRepo,
      reloadScheduler
    })
  })

  afterEach(() => {
    db.close()
  })

  async function createWorkspaceAssistant(
    name: string,
    rootPath: string,
    overrides?: {
      origin?: 'tia' | 'external-acp' | 'built-in'
      studioFeaturesEnabled?: boolean
    }
  ) {
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
      },
      ...(overrides ?? {})
    })
  }

  it('creates a hidden thread and reloads the scheduler when creating a cron job', async () => {
    const assistant = await createWorkspaceAssistant('Scheduler', '/tmp/workspace-a')

    const created = await service.createCronJob({
      assistantId: assistant.id,
      name: 'Morning summary',
      prompt: 'Summarize the workspace status.',
      cronExpression: '0 9 * * 1-5'
    })

    expect(created.threadId).toEqual(expect.any(String))
    await expect(threadsRepo.getById(created.threadId ?? '')).resolves.toMatchObject({
      assistantId: assistant.id,
      metadata: {
        cron: true,
        cronJobId: created.id
      }
    })
    expect(reloadScheduler).toHaveBeenCalledTimes(1)
  })

  it('lists and removes only cron jobs owned by the requested assistant', async () => {
    const firstAssistant = await createWorkspaceAssistant('Scheduler A', '/tmp/workspace-a')
    const secondAssistant = await createWorkspaceAssistant('Scheduler B', '/tmp/workspace-b')

    const firstJob = await service.createCronJob({
      assistantId: firstAssistant.id,
      name: 'Morning summary',
      prompt: 'Summarize workspace A.',
      cronExpression: '0 9 * * 1-5'
    })
    const secondJob = await service.createCronJob({
      assistantId: secondAssistant.id,
      name: 'Evening summary',
      prompt: 'Summarize workspace B.',
      cronExpression: '0 18 * * 1-5'
    })

    await expect(service.listAssistantCronJobs(firstAssistant.id)).resolves.toEqual([
      expect.objectContaining({
        id: firstJob.id,
        assistantId: firstAssistant.id
      })
    ])

    await expect(service.removeAssistantCronJob(firstAssistant.id, secondJob.id)).resolves.toBe(
      false
    )
    await expect(cronJobsRepo.getById(secondJob.id)).resolves.toMatchObject({
      id: secondJob.id
    })

    await expect(service.removeAssistantCronJob(firstAssistant.id, firstJob.id)).resolves.toBe(true)
    await expect(cronJobsRepo.getById(firstJob.id)).resolves.toBeNull()
    await expect(threadsRepo.getById(firstJob.threadId ?? '')).resolves.toBeNull()
  })

  it('rejects cron jobs for external ACP assistants without studio features', async () => {
    const assistant = await createWorkspaceAssistant('External ACP', '/tmp/workspace-c', {
      origin: 'external-acp',
      studioFeaturesEnabled: false
    })

    await expect(
      service.createCronJob({
        assistantId: assistant.id,
        name: 'Morning summary',
        prompt: 'Summarize workspace C.',
        cronExpression: '0 9 * * 1-5'
      })
    ).rejects.toMatchObject({
      code: 'assistant_studio_features_required',
      message: 'Assistant studio features are required for cron jobs'
    })
  })

  it('allows cron jobs after studio features are enabled for external ACP assistants', async () => {
    const assistant = await createWorkspaceAssistant('External ACP', '/tmp/workspace-d', {
      origin: 'external-acp',
      studioFeaturesEnabled: true
    })

    const created = await service.createCronJob({
      assistantId: assistant.id,
      name: 'Morning summary',
      prompt: 'Summarize workspace D.',
      cronExpression: '0 9 * * 1-5'
    })

    expect(created).toMatchObject({
      assistantId: assistant.id,
      name: 'Morning summary',
      prompt: 'Summarize workspace D.',
      cronExpression: '0 9 * * 1-5',
      threadId: expect.any(String)
    })
    expect(reloadScheduler).toHaveBeenCalledTimes(1)
  })
})
