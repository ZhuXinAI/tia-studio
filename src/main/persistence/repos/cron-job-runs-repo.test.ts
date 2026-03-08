import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { CronJobRunsRepository } from './cron-job-runs-repo'
import { CronJobsRepository } from './cron-jobs-repo'
import { ProvidersRepository } from './providers-repo'
import { ThreadsRepository } from './threads-repo'

describe('CronJobRunsRepository', () => {
  let db: AppDatabase
  let jobsRepo: CronJobsRepository
  let runsRepo: CronJobRunsRepository
  let assistantId: string
  let threadId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    jobsRepo = new CronJobsRepository(db)
    runsRepo = new CronJobRunsRepository(db)

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

  it('creates run records ordered newest first and cascades when the cron job is deleted', async () => {
    const cronJob = await jobsRepo.create({
      assistantId,
      threadId,
      name: 'Morning summary',
      prompt: 'Summarize the workspace status',
      cronExpression: '0 9 * * 1-5'
    })

    const olderRun = await runsRepo.create({
      cronJobId: cronJob.id,
      status: 'success',
      scheduledFor: '2026-03-08T09:00:00.000Z',
      startedAt: '2026-03-08T09:00:02.000Z',
      finishedAt: '2026-03-08T09:00:30.000Z',
      output: 'Everything looks good.',
      workLogPath: '/tmp/work-logs/2026-03-08.md'
    })
    const newerRun = await runsRepo.create({
      cronJobId: cronJob.id,
      status: 'failed',
      scheduledFor: '2026-03-09T09:00:00.000Z',
      startedAt: '2026-03-09T09:00:03.000Z',
      finishedAt: '2026-03-09T09:00:15.000Z',
      error: {
        message: 'Provider timed out'
      }
    })

    await expect(runsRepo.listByCronJobId(cronJob.id)).resolves.toEqual([
      expect.objectContaining({
        id: newerRun.id,
        status: 'failed',
        error: {
          message: 'Provider timed out'
        }
      }),
      expect.objectContaining({
        id: olderRun.id,
        status: 'success',
        workLogPath: '/tmp/work-logs/2026-03-08.md'
      })
    ])

    await expect(jobsRepo.delete(cronJob.id)).resolves.toBe(true)
    await expect(runsRepo.listByCronJobId(cronJob.id)).resolves.toEqual([])
  })

  it('persists output text, work-log paths, and structured errors', async () => {
    const cronJob = await jobsRepo.create({
      assistantId,
      threadId,
      name: 'Morning summary',
      prompt: 'Summarize the workspace status',
      cronExpression: '0 9 * * 1-5'
    })

    const created = await runsRepo.create({
      cronJobId: cronJob.id,
      status: 'success',
      scheduledFor: '2026-03-09T09:00:00.000Z',
      startedAt: '2026-03-09T09:00:03.000Z',
      finishedAt: '2026-03-09T09:00:15.000Z',
      outputText: 'Workspace is healthy.',
      workLogPath: '/tmp/workspace-a/.tia/work-logs/2026-03-09.md',
      error: {
        recovered: false
      }
    })

    expect(created).toMatchObject({
      outputText: 'Workspace is healthy.',
      workLogPath: '/tmp/workspace-a/.tia/work-logs/2026-03-09.md',
      error: {
        recovered: false
      }
    })
  })
})
