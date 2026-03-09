import type { Hono } from 'hono'
import {
  AssistantCronJobsService,
  isAssistantCronJobsServiceError
} from '../../cron/assistant-cron-jobs-service'
import type { CronSchedulerService } from '../../cron/cron-scheduler-service'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { CronJobsRepository } from '../../persistence/repos/cron-jobs-repo'
import type { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { createCronJobSchema, updateCronJobSchema } from '../validators/cron-jobs-validator'

type RegisterCronJobsRouteOptions = {
  cronJobsRepo: CronJobsRepository
  assistantsRepo: AssistantsRepository
  threadsRepo: ThreadsRepository
  cronSchedulerService?: Pick<CronSchedulerService, 'reload'>
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

export function registerCronJobsRoute(app: Hono, options: RegisterCronJobsRouteOptions): void {
  const cronJobsService = new AssistantCronJobsService({
    cronJobsRepo: options.cronJobsRepo,
    assistantsRepo: options.assistantsRepo,
    threadsRepo: options.threadsRepo,
    reloadScheduler: async () => options.cronSchedulerService?.reload()
  })

  app.get('/v1/cron-jobs', async (context) => {
    const cronJobs = await cronJobsService.listCronJobs()
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

    try {
      const cronJob = await cronJobsService.createCronJob(parsed.data)
      return context.json(cronJob, 201)
    } catch (error) {
      if (isAssistantCronJobsServiceError(error)) {
        return context.json({ ok: false, error: error.message }, error.statusCode)
      }

      throw error
    }
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

    try {
      const updatedCronJob = await cronJobsService.updateCronJob(
        context.req.param('cronJobId'),
        parsed.data
      )
      return context.json(updatedCronJob)
    } catch (error) {
      if (isAssistantCronJobsServiceError(error)) {
        return context.json({ ok: false, error: error.message }, error.statusCode)
      }

      throw error
    }
  })

  app.delete('/v1/cron-jobs/:cronJobId', async (context) => {
    const removed = await cronJobsService.removeCronJob(context.req.param('cronJobId'))
    if (!removed) {
      return context.json({ ok: false, error: 'Cron job not found' }, 404)
    }

    return context.body(null, 204)
  })
}
