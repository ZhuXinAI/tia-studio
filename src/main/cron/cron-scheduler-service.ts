import { appendWorkLogEntry } from './work-log-writer'
import type { CreateCronJobRunInput } from '../persistence/repos/cron-job-runs-repo'
import type { AppCronJob, UpdateCronJobInput } from '../persistence/repos/cron-jobs-repo'
import { getNextCronRunAt } from './cron-expression'

type CronJobExecutionResult = {
  outputText?: string | null
} | void

type CronJobRunner = (job: AppCronJob) => Promise<CronJobExecutionResult> | CronJobExecutionResult

type CronJobsRepositoryLike = {
  list(): Promise<AppCronJob[]>
  getById(id: string): Promise<AppCronJob | null>
  update(id: string, input: UpdateCronJobInput): Promise<AppCronJob | null>
}

type CronJobRunsRepositoryLike = {
  create(input: CreateCronJobRunInput): Promise<unknown>
}

type AssistantsRepositoryLike = {
  getById(id: string): Promise<{
    name: string
    workspaceConfig: Record<string, unknown>
  } | null>
}

type CronSchedulerServiceOptions = {
  cronJobsRepo: CronJobsRepositoryLike
  cronJobRunsRepo?: CronJobRunsRepositoryLike
  assistantsRepo?: AssistantsRepositoryLike
  runJob?: CronJobRunner
  writeWorkLog?: typeof appendWorkLogEntry
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    }
  }

  return {
    name: 'Error',
    message: typeof error === 'string' ? error : 'Unknown error'
  }
}

export class CronSchedulerService {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly runningJobs = new Set<string>()
  private started = false

  constructor(private readonly options: CronSchedulerServiceOptions) {}

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true
    await this.reload()
  }

  async stop(): Promise<void> {
    this.started = false
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }

  async reload(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()

    const jobs = await this.options.cronJobsRepo.list()
    for (const job of jobs) {
      await this.syncJob(job)
    }
  }

  private async syncJob(job: AppCronJob): Promise<void> {
    if (!job.enabled) {
      if (job.nextRunAt !== null) {
        await this.options.cronJobsRepo.update(job.id, { nextRunAt: null })
      }
      return
    }

    if (this.runningJobs.has(job.id)) {
      return
    }

    const nextRunAt = getNextCronRunAt(job.cronExpression, new Date())
    await this.options.cronJobsRepo.update(job.id, {
      nextRunAt: nextRunAt?.toISOString() ?? null
    })

    if (!this.started || !nextRunAt) {
      return
    }

    const delay = Math.max(0, nextRunAt.getTime() - Date.now())
    const timer = setTimeout(async () => {
      this.timers.delete(job.id)
      await this.executeJob(job.id, nextRunAt.toISOString()).catch(() => undefined)
    }, delay)

    this.timers.set(job.id, timer)
  }

  private async executeJob(jobId: string, scheduledFor: string): Promise<void> {
    if (!this.started || this.runningJobs.has(jobId)) {
      return
    }

    const job = await this.options.cronJobsRepo.getById(jobId)
    if (!job) {
      return
    }

    if (!job.enabled) {
      await this.options.cronJobsRepo.update(jobId, { nextRunAt: null })
      return
    }

    if (!this.options.runJob) {
      await this.syncJob(job)
      return
    }

    this.runningJobs.add(jobId)

    const startedAt = new Date().toISOString()
    let status: 'success' | 'failed' = 'success'
    let outputText: string | null = null
    let errorPayload: Record<string, unknown> | null = null
    let workLogPath: string | null = null

    try {
      const result = await this.options.runJob(job)
      outputText = toNonEmptyString(result && typeof result === 'object' ? result.outputText : null)

      const assistant = await this.options.assistantsRepo?.getById(job.assistantId)
      const workspaceRootPath = toNonEmptyString(assistant?.workspaceConfig?.rootPath)
      if (assistant && workspaceRootPath && outputText) {
        const writeWorkLog = this.options.writeWorkLog ?? appendWorkLogEntry
        workLogPath = await writeWorkLog({
          workspaceRootPath,
          assistantName: assistant.name,
          cronJobName: job.name,
          outputText,
          occurredAt: new Date(scheduledFor)
        })
      }
    } catch (error) {
      status = 'failed'
      errorPayload = serializeError(error)
    } finally {
      this.runningJobs.delete(jobId)

      const now = new Date()
      const nextRunAt = getNextCronRunAt(job.cronExpression, now)?.toISOString() ?? null
      const finishedAt = now.toISOString()

      await this.options.cronJobsRepo.update(jobId, {
        lastRunAt: scheduledFor,
        nextRunAt,
        lastRunStatus: status,
        lastError: status === 'failed' ? String(errorPayload?.message ?? 'Unknown error') : null
      })

      if (this.options.cronJobRunsRepo) {
        await this.options.cronJobRunsRepo.create({
          cronJobId: jobId,
          status,
          scheduledFor,
          startedAt,
          finishedAt,
          outputText,
          error: errorPayload,
          workLogPath
        })
      }
    }

    if (!this.started) {
      return
    }

    const latestJob = await this.options.cronJobsRepo.getById(jobId)
    if (!latestJob) {
      return
    }

    await this.syncJob(latestJob)
  }
}
