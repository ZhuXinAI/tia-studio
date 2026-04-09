import type { Hono } from 'hono'
import {
  AssistantHeartbeatsService,
  isAssistantHeartbeatsServiceError
} from '../../heartbeat/assistant-heartbeats-service'
import type { HeartbeatSchedulerService } from '../../heartbeat/heartbeat-scheduler-service'
import type { AssistantHeartbeatsRepository } from '../../persistence/repos/assistant-heartbeats-repo'
import type { AssistantHeartbeatRunsRepository } from '../../persistence/repos/assistant-heartbeat-runs-repo'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { CronJobsRepository } from '../../persistence/repos/cron-jobs-repo'
import type { CronJobRunsRepository } from '../../persistence/repos/cron-job-runs-repo'
import type { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { updateAssistantHeartbeatSchema } from '../validators/assistant-heartbeat-validator'

type RegisterAssistantHeartbeatRouteOptions = {
  heartbeatsRepo: AssistantHeartbeatsRepository
  heartbeatRunsRepo: AssistantHeartbeatRunsRepository
  cronJobsRepo: CronJobsRepository
  cronJobRunsRepo: CronJobRunsRepository
  assistantsRepo: AssistantsRepository
  threadsRepo: ThreadsRepository
  heartbeatSchedulerService?: Pick<HeartbeatSchedulerService, 'reload'>
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

export function registerAssistantHeartbeatRoute(
  app: Hono,
  options: RegisterAssistantHeartbeatRouteOptions
): void {
  const heartbeatsService = new AssistantHeartbeatsService({
    heartbeatsRepo: options.heartbeatsRepo,
    assistantsRepo: options.assistantsRepo,
    threadsRepo: options.threadsRepo,
    reloadScheduler: async () => options.heartbeatSchedulerService?.reload()
  })

  app.get('/v1/assistants/:assistantId/heartbeat', async (context) => {
    try {
      const heartbeat = await heartbeatsService.getAssistantHeartbeat(
        context.req.param('assistantId')
      )
      return context.json(heartbeat)
    } catch (error) {
      if (isAssistantHeartbeatsServiceError(error)) {
        if (error.code === 'assistant_not_found') {
          return context.json({ ok: false, error: error.message }, error.statusCode)
        }
        // For workspace requirement errors, return null instead of error
        return context.json(null)
      }

      throw error
    }
  })

  app.patch('/v1/assistants/:assistantId/heartbeat', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = updateAssistantHeartbeatSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const heartbeat = await heartbeatsService.upsertHeartbeat({
        assistantId: context.req.param('assistantId'),
        ...parsed.data
      })

      return context.json(heartbeat)
    } catch (error) {
      if (isAssistantHeartbeatsServiceError(error)) {
        if (error.code === 'assistant_studio_features_required') {
          return context.json({ ok: false, code: error.code, error: error.message }, error.statusCode)
        }
        return context.json({ ok: false, error: error.message }, error.statusCode)
      }

      throw error
    }
  })

  app.get('/v1/assistants/:assistantId/heartbeat/runs', async (context) => {
    try {
      const assistantId = context.req.param('assistantId')

      // Get heartbeat runs
      const heartbeat = await options.heartbeatsRepo.getByAssistantId(assistantId)
      const heartbeatRuns = heartbeat
        ? await options.heartbeatRunsRepo.listByHeartbeatId(heartbeat.id)
        : []

      // Get cron job runs for this assistant
      const cronJobs = await options.cronJobsRepo.listByAssistantId(assistantId)
      const cronRunsPromises = cronJobs.map((job) =>
        options.cronJobRunsRepo.listByCronJobId(job.id)
      )
      const cronRunsArrays = await Promise.all(cronRunsPromises)
      const allCronRuns = cronRunsArrays.flat()

      // Combine and sort by scheduled time, limit to 10 most recent
      const combinedRuns = [
        ...heartbeatRuns.map((run) => ({ ...run, type: 'heartbeat' as const })),
        ...allCronRuns.map((run) => ({ ...run, type: 'cron' as const }))
      ]
        .sort((a, b) => {
          const timeA = new Date(a.scheduledFor).getTime()
          const timeB = new Date(b.scheduledFor).getTime()
          return timeB - timeA
        })
        .slice(0, 10)

      return context.json({ runs: combinedRuns })
    } catch (error) {
      if (isAssistantHeartbeatsServiceError(error)) {
        return context.json({ ok: false, error: error.message }, error.statusCode)
      }

      throw error
    }
  })
}
