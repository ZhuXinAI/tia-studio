import * as cron from 'node-cron'
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

type NodeCronSchedulerServiceOptions = {
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

export class NodeCronSchedulerService {
  private readonly tasks = new Map<string, cron.ScheduledTask>()
  private readonly runningJobs = new Set<string>()
  private started = false

  constructor(private readonly options: NodeCronSchedulerServiceOptions) {}

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true
    await this.reload()
  }

  async stop(): Promise<void> {
    this.started = false
    for (const task of this.tasks.values()) {
      task.stop()
    }
    this.tasks.clear()
  }

  async reload(): Promise<void> {
    for (const task of this.tasks.values()) {
      task.stop()
    }
    this.tasks.clear()

    const jobs = await this.options.cronJobsRepo.list()
    console.log(`[NodeCronScheduler] Loaded ${jobs.length} cron job(s)`)

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
      if (job.nextRunAt !== null) {
        await this.options.cronJobsRepo.update(job.id, { nextRunAt: null })
      }
      return
    }

    if (!assistantEnabled) {
      if (job.nextRunAt !== null) {
        await this.options.cronJobsRepo.update(job.id, { nextRunAt: null })
      }
      return
    }

    const nextRunAt = getNextCronRunAt(job.cronExpression, new Date())
    await this.options.cronJobsRepo.update(job.id, {
      nextRunAt: nextRunAt?.toISOString() ?? null
    })

    if (!this.started || !nextRunAt) {
      return
    }

    console.log(
      `[NodeCronScheduler] Scheduled "${job.name}" (${job.cronExpression}) for ${nextRunAt.toISOString()}`
    )

    // Create and schedule the cron task
    // Use system local timezone to match getNextCronRunAt behavior
    const task = cron.schedule(
      job.cronExpression,
      async () => {
        const scheduledFor = new Date().toISOString()
        await this.executeJob(job.id, scheduledFor).catch((error) => {
          console.error(`[NodeCronScheduler] Unhandled error in job ${job.id}:`, error)
        })
      },
      {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    )

    this.tasks.set(job.id, task)
  }

  private async executeJob(jobId: string, scheduledFor: string): Promise<void> {
    if (this.runningJobs.has(jobId)) {
      return
    }

    const job = await this.options.cronJobsRepo.getById(jobId)
    if (!job) {
      return
    }

    console.log(`[NodeCronScheduler] Executing "${job.name}" with prompt: "${job.prompt}"`)

    if (!job.enabled || !(await this.isAssistantEnabled(job.assistantId))) {
      await this.options.cronJobsRepo.update(jobId, { nextRunAt: null })
      return
    }

    if (!this.options.runJob) {
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

      if (outputText) {
        console.log(
          `[NodeCronScheduler] Job "${job.name}" generated output (${outputText.length} chars)`
        )
      } else {
        console.log(`[NodeCronScheduler] Job "${job.name}" completed with no output`)
      }

      if (assistant && workspaceRootPath && outputText) {
        const writeWorkLog = this.options.writeWorkLog ?? appendWorkLogEntry
        workLogPath = await writeWorkLog({
          workspaceRootPath,
          assistantName: assistant.name,
          cronJobName: job.name,
          outputText,
          occurredAt: new Date(scheduledFor)
        })
        console.log(`[NodeCronScheduler] Work log written to: ${workLogPath}`)
      } else if (!workspaceRootPath) {
        console.log(`[NodeCronScheduler] No workspace configured, skipping work log`)
      }
    } catch (error) {
      status = 'failed'
      errorPayload = serializeError(error)
      console.error(`[NodeCronScheduler] Job "${job.name}" failed:`, error)
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
  }
}
