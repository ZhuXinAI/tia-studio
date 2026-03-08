import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppAssistant } from '../persistence/repos/assistants-repo'
import type { AppCronJob, UpdateCronJobInput } from '../persistence/repos/cron-jobs-repo'
import type { AppCronJobRun, CreateCronJobRunInput } from '../persistence/repos/cron-job-runs-repo'
import { CronSchedulerService } from './cron-scheduler-service'

type MutableCronJob = AppCronJob
type MutableCronJobRun = AppCronJobRun

function createCronJob(overrides?: Partial<MutableCronJob>): MutableCronJob {
  return {
    id: 'cron-job-1',
    assistantId: 'assistant-1',
    threadId: 'thread-1',
    name: 'Daily summary',
    prompt: 'Summarize the workspace status',
    cronExpression: '15 10 * * *',
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
    lastRunStatus: null,
    lastError: null,
    createdAt: '2026-03-09T09:00:00.000Z',
    updatedAt: '2026-03-09T09:00:00.000Z',
    ...overrides
  }
}

class InMemoryCronJobsRepo {
  constructor(private readonly jobs: MutableCronJob[]) {}

  async list(): Promise<AppCronJob[]> {
    return this.jobs.map((job) => ({ ...job }))
  }

  async getById(id: string): Promise<AppCronJob | null> {
    const job = this.jobs.find((candidate) => candidate.id === id)
    return job ? { ...job } : null
  }

  async update(id: string, input: UpdateCronJobInput): Promise<AppCronJob | null> {
    const job = this.jobs.find((candidate) => candidate.id === id)
    if (!job) {
      return null
    }

    Object.assign(job, input)
    job.updatedAt = new Date().toISOString()
    return { ...job }
  }
}

class InMemoryCronJobRunsRepo {
  readonly runs: MutableCronJobRun[] = []

  async create(input: CreateCronJobRunInput): Promise<AppCronJobRun> {
    const run: MutableCronJobRun = {
      id: `run-${this.runs.length + 1}`,
      cronJobId: input.cronJobId,
      status: input.status,
      scheduledFor: input.scheduledFor,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt ?? null,
      outputText: input.outputText ?? input.output ?? null,
      error: input.error ?? null,
      workLogPath: input.workLogPath ?? null,
      createdAt: new Date().toISOString()
    }

    this.runs.unshift(run)
    return { ...run }
  }

  async listByCronJobId(cronJobId: string): Promise<AppCronJobRun[]> {
    return this.runs.filter((run) => run.cronJobId === cronJobId).map((run) => ({ ...run }))
  }
}

function createAssistant(overrides?: Partial<AppAssistant>): AppAssistant {
  return {
    id: 'assistant-1',
    name: 'TIA',
    description: 'Handles general assistant requests.',
    instructions: 'You are helpful.',
    providerId: 'provider-1',
    workspaceConfig: { rootPath: '/tmp/workspace-a' },
    skillsConfig: {},
    mcpConfig: {},
    maxSteps: 100,
    memoryConfig: null,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides
  }
}

describe('CronSchedulerService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules only future runs after restart and reloads job state', async () => {
    vi.setSystemTime(new Date('2026-03-09T10:05:00.000Z'))
    const jobs = [
      createCronJob({
        id: 'cron-job-1',
        cronExpression: '0 10 * * *',
        nextRunAt: '2026-03-08T10:00:00.000Z'
      }),
      createCronJob({
        id: 'cron-job-2',
        enabled: false,
        nextRunAt: '2026-03-09T10:15:00.000Z'
      })
    ]
    const repo = new InMemoryCronJobsRepo(jobs)
    const runJob = vi.fn(async () => {})
    const scheduler = new CronSchedulerService({
      cronJobsRepo: repo,
      runJob
    })

    await scheduler.start()

    expect((await repo.getById('cron-job-1'))?.nextRunAt).toBe('2026-03-10T10:00:00.000Z')
    expect((await repo.getById('cron-job-2'))?.nextRunAt).toBeNull()

    await repo.update('cron-job-1', { cronExpression: '30 10 * * *' })
    await scheduler.reload()

    expect((await repo.getById('cron-job-1'))?.nextRunAt).toBe('2026-03-09T10:30:00.000Z')
    expect(runJob).not.toHaveBeenCalled()

    await scheduler.stop()
  })

  it('prevents overlapping execution for the same job', async () => {
    vi.setSystemTime(new Date('2026-03-09T10:14:00.000Z'))
    const jobs = [
      createCronJob({
        cronExpression: '* * * * *'
      })
    ]
    const repo = new InMemoryCronJobsRepo(jobs)
    let resolveRun: (() => void) | null = null
    const runJob = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve
        })
    )
    const scheduler = new CronSchedulerService({
      cronJobsRepo: repo,
      runJob
    })

    await scheduler.start()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(runJob).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(runJob).toHaveBeenCalledTimes(1)

    const releaseRun = resolveRun as (() => void) | null
    if (releaseRun) {
      releaseRun()
    }
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(runJob).toHaveBeenCalledTimes(2)

    await scheduler.stop()
  })

  it('records successful scheduled runs, writes work logs, and updates job status fields', async () => {
    vi.setSystemTime(new Date('2026-03-09T10:14:00.000Z'))
    const jobs = [
      createCronJob({
        cronExpression: '* * * * *'
      })
    ]
    const repo = new InMemoryCronJobsRepo(jobs)
    const runsRepo = new InMemoryCronJobRunsRepo()
    const runJob = vi.fn(async () => ({
      outputText: 'Workspace is healthy.'
    }))
    const writeWorkLog = vi.fn(async () => '/tmp/workspace-a/.tia/work-logs/2026-03-09.md')
    const scheduler = new CronSchedulerService({
      cronJobsRepo: repo,
      cronJobRunsRepo: runsRepo,
      assistantsRepo: {
        getById: vi.fn(async () => createAssistant())
      },
      runJob,
      writeWorkLog
    })

    await scheduler.start()
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(repo.getById('cron-job-1')).resolves.toMatchObject({
      lastRunAt: '2026-03-09T10:15:00.000Z',
      nextRunAt: '2026-03-09T10:16:00.000Z',
      lastRunStatus: 'success',
      lastError: null
    })
    await expect(runsRepo.listByCronJobId('cron-job-1')).resolves.toEqual([
      expect.objectContaining({
        status: 'success',
        scheduledFor: '2026-03-09T10:15:00.000Z',
        outputText: 'Workspace is healthy.',
        workLogPath: '/tmp/workspace-a/.tia/work-logs/2026-03-09.md'
      })
    ])
    expect(writeWorkLog).toHaveBeenCalledWith({
      workspaceRootPath: '/tmp/workspace-a',
      assistantName: 'TIA',
      cronJobName: 'Daily summary',
      outputText: 'Workspace is healthy.',
      occurredAt: new Date('2026-03-09T10:15:00.000Z')
    })

    await scheduler.stop()
  })

  it('records failed scheduled runs and still reschedules the next future run', async () => {
    vi.setSystemTime(new Date('2026-03-09T10:14:00.000Z'))
    const jobs = [
      createCronJob({
        cronExpression: '* * * * *'
      })
    ]
    const repo = new InMemoryCronJobsRepo(jobs)
    const runsRepo = new InMemoryCronJobRunsRepo()
    const writeWorkLog = vi.fn(async () => '/tmp/workspace-a/.tia/work-logs/2026-03-09.md')
    const scheduler = new CronSchedulerService({
      cronJobsRepo: repo,
      cronJobRunsRepo: runsRepo,
      assistantsRepo: {
        getById: vi.fn(async () => createAssistant())
      },
      runJob: vi.fn(async () => {
        throw new Error('Provider timed out')
      }),
      writeWorkLog
    })

    await scheduler.start()
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(repo.getById('cron-job-1')).resolves.toMatchObject({
      lastRunAt: '2026-03-09T10:15:00.000Z',
      nextRunAt: '2026-03-09T10:16:00.000Z',
      lastRunStatus: 'failed',
      lastError: 'Provider timed out'
    })
    await expect(runsRepo.listByCronJobId('cron-job-1')).resolves.toEqual([
      expect.objectContaining({
        status: 'failed',
        scheduledFor: '2026-03-09T10:15:00.000Z',
        error: {
          message: 'Provider timed out',
          name: 'Error'
        },
        workLogPath: null
      })
    ])
    expect(writeWorkLog).not.toHaveBeenCalled()

    await scheduler.stop()
  })
})
