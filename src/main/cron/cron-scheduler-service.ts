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
    enabled?: boolean
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

    console.log('[CronScheduler] Starting cron scheduler...')
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
    console.log(`[CronScheduler] Reloading ${jobs.length} cron job(s)`)
    for (const job of jobs) {
      await this.syncJob(job)
    }
  }

  private async isAssistantEnabled(assistantId: string): Promise<boolean> {
    if (!this.options.assistantsRepo) {
      return true
    }

    const assistant = await this.options.assistantsRepo.getById(assistantId)
    return assistant?.enabled !== false
  }

  private async syncJob(job: AppCronJob): Promise<void> {
    const assistantEnabled = await this.isAssistantEnabled(job.assistantId)

    if (!job.enabled) {
      console.log(`[CronScheduler] Job "${job.name}" (${job.id}) is disabled, skipping`)
      if (job.nextRunAt !== null) {
        await this.options.cronJobsRepo.update(job.id, { nextRunAt: null })
      }
      return
    }

    if (!assistantEnabled) {
      console.log(`[CronScheduler] Job "${job.name}" (${job.id}) has disabled assistant, skipping`)
      if (job.nextRunAt !== null) {
        await this.options.cronJobsRepo.update(job.id, { nextRunAt: null })
      }
      return
    }

    if (this.runningJobs.has(job.id)) {
      console.log(`[CronScheduler] Job "${job.name}" (${job.id}) is already running, skipping`)
      return
    }

    const nextRunAt = getNextCronRunAt(job.cronExpression, new Date())
    await this.options.cronJobsRepo.update(job.id, {
      nextRunAt: nextRunAt?.toISOString() ?? null
    })

    if (!this.started || !nextRunAt) {
      console.log(`[CronScheduler] Job "${job.name}" (${job.id}) - scheduler not started or no next run time`)
      return
    }

    const delay = Math.max(0, nextRunAt.getTime() - Date.now())
    console.log(`[CronScheduler] Job "${job.name}" (${job.id}) scheduled for ${nextRunAt.toISOString()} (in ${Math.round(delay / 1000)}s)`)

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
      console.log(`[CronScheduler] Job ${jobId} not found, skipping execution`)
      return
    }

    console.log(`[CronScheduler] Executing job "${job.name}" (${job.id}) scheduled for ${scheduledFor}`)

    if (!job.enabled || !(await this.isAssistantEnabled(job.assistantId))) {
      console.log(`[CronScheduler] Job "${job.name}" (${job.id}) is disabled or assistant is disabled, skipping`)
      await this.options.cronJobsRepo.update(jobId, { nextRunAt: null })
      return
    }

    if (!this.options.runJob) {
      console.log(`[CronScheduler] No runJob handler configured, rescheduling`)
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
      console.log(`[CronScheduler] Running job "${job.name}" (${job.id})...`)
      const result = await this.options.runJob(job)
      outputText = toNonEmptyString(result && typeof result === 'object' ? result.outputText : null)
      console.log(`[CronScheduler] Job "${job.name}" (${job.id}) completed successfully`)

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
      console.error(`[CronScheduler] Job "${job.name}" (${job.id}) failed:`, error)
    } finally {
      this.runningJobs.delete(jobId)

      const now = new Date()
      const nextRunAt = job.recurring
        ? getNextCronRunAt(job.cronExpression, now)?.toISOString() ?? null
        : null
      const finishedAt = now.toISOString()

      await this.options.cronJobsRepo.update(jobId, {
        lastRunAt: scheduledFor,
        nextRunAt,
        lastRunStatus: status,
        lastError: status === 'failed' ? String(errorPayload?.message ?? 'Unknown error') : null,
        enabled: job.recurring ? undefined : false
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

    if (latestJob.recurring) {
      await this.syncJob(latestJob)
    }
  }
}
