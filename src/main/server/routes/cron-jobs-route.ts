import type { Hono } from 'hono'
import { isValidCronExpression } from '../../cron/cron-expression'
import type { CronSchedulerService } from '../../cron/cron-scheduler-service'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { CronJobsRepository } from '../../persistence/repos/cron-jobs-repo'
import type { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { createCronJobSchema, updateCronJobSchema } from '../validators/cron-jobs-validator'

const DEFAULT_CRON_THREAD_RESOURCE_ID = 'default-profile'

type RegisterCronJobsRouteOptions = {
  cronJobsRepo: CronJobsRepository
  assistantsRepo: AssistantsRepository
  threadsRepo: ThreadsRepository
  cronSchedulerService?: Pick<CronSchedulerService, 'reload'>
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

function hasWorkspaceRootPath(workspaceConfig: Record<string, unknown>): boolean {
  return typeof workspaceConfig.rootPath === 'string' && workspaceConfig.rootPath.trim().length > 0
}

async function validateAssistantForCronJob(
  assistantsRepo: AssistantsRepository,
  assistantId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const assistant = await assistantsRepo.getById(assistantId)
  if (!assistant) {
    return { ok: false, error: 'Assistant not found' }
  }

  if (!hasWorkspaceRootPath(assistant.workspaceConfig ?? {})) {
    return { ok: false, error: 'Assistant workspace is required for cron jobs' }
  }

  return { ok: true }
}

async function reloadScheduler(
  cronSchedulerService: RegisterCronJobsRouteOptions['cronSchedulerService']
): Promise<void> {
  await cronSchedulerService?.reload()
}

export function registerCronJobsRoute(app: Hono, options: RegisterCronJobsRouteOptions): void {
  app.get('/v1/cron-jobs', async (context) => {
    const cronJobs = await options.cronJobsRepo.list()
    return context.json(cronJobs)
  })

  app.post('/v1/cron-jobs', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = createCronJobSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    if (!isValidCronExpression(parsed.data.cronExpression)) {
      return context.json({ ok: false, error: 'Invalid cron expression' }, 400)
    }

    const assistantValidation = await validateAssistantForCronJob(
      options.assistantsRepo,
      parsed.data.assistantId
    )
    if (!assistantValidation.ok) {
      return context.json({ ok: false, error: assistantValidation.error }, 400)
    }

    const cronJob = await options.cronJobsRepo.create({
      assistantId: parsed.data.assistantId,
      name: parsed.data.name,
      prompt: parsed.data.prompt,
      cronExpression: parsed.data.cronExpression,
      enabled: parsed.data.enabled
    })

    const hiddenThread = await options.threadsRepo.create({
      assistantId: parsed.data.assistantId,
      resourceId: DEFAULT_CRON_THREAD_RESOURCE_ID,
      title: parsed.data.name,
      metadata: {
        cron: true,
        cronJobId: cronJob.id
      }
    })

    const updatedCronJob = await options.cronJobsRepo.update(cronJob.id, {
      threadId: hiddenThread.id
    })

    await reloadScheduler(options.cronSchedulerService)

    return context.json(updatedCronJob ?? cronJob, 201)
  })

  app.patch('/v1/cron-jobs/:cronJobId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = updateCronJobSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    if (
      parsed.data.cronExpression !== undefined &&
      !isValidCronExpression(parsed.data.cronExpression)
    ) {
      return context.json({ ok: false, error: 'Invalid cron expression' }, 400)
    }

    const existingCronJob = await options.cronJobsRepo.getById(context.req.param('cronJobId'))
    if (!existingCronJob) {
      return context.json({ ok: false, error: 'Cron job not found' }, 404)
    }

    const nextAssistantId = parsed.data.assistantId ?? existingCronJob.assistantId
    if (parsed.data.assistantId) {
      const assistantValidation = await validateAssistantForCronJob(
        options.assistantsRepo,
        parsed.data.assistantId
      )
      if (!assistantValidation.ok) {
        return context.json({ ok: false, error: assistantValidation.error }, 400)
      }
    }

    let nextThreadId = existingCronJob.threadId
    if (parsed.data.assistantId && parsed.data.assistantId !== existingCronJob.assistantId) {
      if (existingCronJob.threadId) {
        await options.threadsRepo.delete(existingCronJob.threadId)
      }

      const replacementThread = await options.threadsRepo.create({
        assistantId: nextAssistantId,
        resourceId: DEFAULT_CRON_THREAD_RESOURCE_ID,
        title: parsed.data.name ?? existingCronJob.name,
        metadata: {
          cron: true,
          cronJobId: existingCronJob.id
        }
      })
      nextThreadId = replacementThread.id
    }

    const updatedCronJob = await options.cronJobsRepo.update(existingCronJob.id, {
      assistantId: nextAssistantId,
      name: parsed.data.name,
      prompt: parsed.data.prompt,
      cronExpression: parsed.data.cronExpression,
      enabled: parsed.data.enabled,
      threadId: nextThreadId
    })
    if (!updatedCronJob) {
      return context.json({ ok: false, error: 'Cron job not found' }, 404)
    }

    await reloadScheduler(options.cronSchedulerService)

    return context.json(updatedCronJob)
  })

  app.delete('/v1/cron-jobs/:cronJobId', async (context) => {
    const existingCronJob = await options.cronJobsRepo.getById(context.req.param('cronJobId'))
    if (!existingCronJob) {
      return context.json({ ok: false, error: 'Cron job not found' }, 404)
    }

    if (existingCronJob.threadId) {
      await options.threadsRepo.delete(existingCronJob.threadId)
    }

    await options.cronJobsRepo.delete(existingCronJob.id)
    await reloadScheduler(options.cronSchedulerService)

    return context.body(null, 204)
  })
}
