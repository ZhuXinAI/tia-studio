import type { Hono } from 'hono'
import {
  AssistantHeartbeatsService,
  isAssistantHeartbeatsServiceError
} from '../../heartbeat/assistant-heartbeats-service'
import type { HeartbeatSchedulerService } from '../../heartbeat/heartbeat-scheduler-service'
import type { AssistantHeartbeatsRepository } from '../../persistence/repos/assistant-heartbeats-repo'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { updateAssistantHeartbeatSchema } from '../validators/assistant-heartbeat-validator'

type RegisterAssistantHeartbeatRouteOptions = {
  heartbeatsRepo: AssistantHeartbeatsRepository
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
      const heartbeat = await heartbeatsService.getAssistantHeartbeat(context.req.param('assistantId'))
      return context.json(heartbeat)
    } catch (error) {
      if (isAssistantHeartbeatsServiceError(error)) {
        return context.json({ ok: false, error: error.message }, error.statusCode)
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
        return context.json({ ok: false, error: error.message }, error.statusCode)
      }

      throw error
    }
  })
}
