import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { CronJobsRepository } from './cron-jobs-repo'
import { ProvidersRepository } from './providers-repo'
import { ThreadsRepository } from './threads-repo'

describe('CronJobsRepository', () => {
  let db: AppDatabase
  let repo: CronJobsRepository
  let assistantId: string
  let threadId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new CronJobsRepository(db)

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
      name: 'Scheduler Assistant',
      providerId: provider.id
    })

    assistantId = assistant.id
    threadId = (
      await threadsRepo.create({
        assistantId,
        resourceId: 'profile-default',
        title: 'Cron backing thread'
      })
    ).id
  })

  afterEach(() => {
    db.close()
  })

  it('creates and updates cron jobs with thread and last-run fields', async () => {
    const created = await repo.create({
      assistantId,
      threadId,
      name: 'Morning summary',
      prompt: 'Summarize the workspace status',
      cronExpression: '0 9 * * 1-5'
    })

    expect(created).toMatchObject({
      assistantId,
      threadId,
      name: 'Morning summary',
      prompt: 'Summarize the workspace status',
      cronExpression: '0 9 * * 1-5',
      enabled: true,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
      lastError: null
    })

    const updated = await repo.update(created.id, {
      threadId: null,
      lastRunStatus: 'failed',
      lastError: 'Provider timed out'
    })

    expect(updated).toMatchObject({
      id: created.id,
      threadId: null,
      lastRunStatus: 'failed',
      lastError: 'Provider timed out'
    })
    await expect(repo.list()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        threadId: null,
        lastRunStatus: 'failed',
        lastError: 'Provider timed out'
      })
    ])
  })
})
