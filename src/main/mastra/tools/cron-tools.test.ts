import { describe, expect, it, vi } from 'vitest'
import type { AppCronJob } from '../../persistence/repos/cron-jobs-repo'
import { createCronTools } from './cron-tools'

function buildCronJob(overrides?: Partial<AppCronJob>): AppCronJob {
  return {
    id: 'cron-job-1',
    assistantId: 'assistant-1',
    threadId: 'thread-1',
    name: 'Morning summary',
    prompt: 'Summarize the workspace status.',
    cronExpression: '0 9 * * 1-5',
    enabled: true,
    lastRunAt: null,
    nextRunAt: '2026-03-10T09:00:00.000Z',
    lastRunStatus: null,
    lastError: null,
    createdAt: '2026-03-09T00:00:00.000Z',
    updatedAt: '2026-03-09T00:00:00.000Z',
    ...overrides
  }
}

describe('cron tools', () => {
  it('creates cron jobs for the current assistant', async () => {
    const cronJobService = {
      createCronJob: vi.fn(async () => buildCronJob()),
      listAssistantCronJobs: vi.fn(async () => []),
      removeAssistantCronJob: vi.fn(async () => true)
    }

    const tools = createCronTools({
      assistantId: 'assistant-1',
      cronJobService
    })

    if (!tools.createCronJob.execute) {
      throw new Error('Expected createCronJob.execute to exist')
    }

    const result = await tools.createCronJob.execute(
      {
        name: 'Morning summary',
        prompt: 'Summarize the workspace status.',
        cronExpression: '0 9 * * 1-5',
        enabled: true
      },
      {} as never
    )

    expect(cronJobService.createCronJob).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      name: 'Morning summary',
      prompt: 'Summarize the workspace status.',
      cronExpression: '0 9 * * 1-5',
      enabled: true
    })
    expect(result).toMatchObject({
      cronJobId: 'cron-job-1',
      name: 'Morning summary',
      cronExpression: '0 9 * * 1-5'
    })
  })

  it('lists only cron jobs for the current assistant', async () => {
    const cronJobService = {
      createCronJob: vi.fn(async () => buildCronJob()),
      listAssistantCronJobs: vi.fn(async () => [
        buildCronJob(),
        buildCronJob({
          id: 'cron-job-2',
          name: 'Evening summary',
          cronExpression: '0 18 * * 1-5'
        })
      ]),
      removeAssistantCronJob: vi.fn(async () => true)
    }

    const tools = createCronTools({
      assistantId: 'assistant-1',
      cronJobService
    })

    if (!tools.listCronJobs.execute) {
      throw new Error('Expected listCronJobs.execute to exist')
    }

    const result = (await tools.listCronJobs.execute({}, {} as never)) as {
      jobs: Array<{ cronJobId: string }>
    }

    expect(cronJobService.listAssistantCronJobs).toHaveBeenCalledWith('assistant-1')
    expect(result.jobs).toHaveLength(2)
    expect(result.jobs[0]).toMatchObject({
      cronJobId: 'cron-job-1'
    })
  })

  it('returns a helpful failure when removing another assistant’s cron job', async () => {
    const cronJobService = {
      createCronJob: vi.fn(async () => buildCronJob()),
      listAssistantCronJobs: vi.fn(async () => []),
      removeAssistantCronJob: vi.fn(async () => false)
    }

    const tools = createCronTools({
      assistantId: 'assistant-1',
      cronJobService
    })

    if (!tools.removeCronJob.execute) {
      throw new Error('Expected removeCronJob.execute to exist')
    }

    await expect(
      tools.removeCronJob.execute(
        {
          cronJobId: 'cron-job-2'
        },
        {} as never
      )
    ).resolves.toEqual({
      success: false,
      cronJobId: 'cron-job-2',
      message: 'Cron job cron-job-2 was not found for this assistant.'
    })
  })
})
