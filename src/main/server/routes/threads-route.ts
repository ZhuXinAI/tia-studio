import type { Hono } from 'hono'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { createThreadSchema, updateThreadSchema } from '../validators/threads-validator'

type RegisterThreadsRouteOptions = {
  threadsRepo: ThreadsRepository
  assistantsRepo?: AssistantsRepository
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

export function registerThreadsRoute(app: Hono, options: RegisterThreadsRouteOptions): void {
  app.get('/v1/threads', async (context) => {
    const assistantId = context.req.query('assistantId')
    if (!assistantId) {
      return context.json({ ok: false, error: 'assistantId query is required' }, 400)
    }

    const threads = await options.threadsRepo.listByAssistant(assistantId)
    return context.json(threads)
  })

  app.post('/v1/threads', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = createThreadSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    if (options.assistantsRepo) {
      const assistant = await options.assistantsRepo.getById(parsed.data.assistantId)
      if (!assistant) {
        return context.json({ ok: false, error: 'Assistant not found' }, 400)
      }
    }

    const thread = await options.threadsRepo.create(parsed.data)
    return context.json(thread, 201)
  })

  app.patch('/v1/threads/:threadId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = updateThreadSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const thread = await options.threadsRepo.updateTitle(
      context.req.param('threadId'),
      parsed.data.title
    )
    if (!thread) {
      return context.json({ ok: false, error: 'Thread not found' }, 404)
    }

    return context.json(thread)
  })

  app.delete('/v1/threads/:threadId', async (context) => {
    const deleted = await options.threadsRepo.delete(context.req.param('threadId'))
    if (!deleted) {
      return context.json({ ok: false, error: 'Thread not found' }, 404)
    }

    return context.body(null, 204)
  })
}
