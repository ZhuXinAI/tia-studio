import type { Hono } from 'hono'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { ChannelThreadBindingsRepository } from '../../persistence/repos/channel-thread-bindings-repo'
import type { AppThread, ThreadsRepository } from '../../persistence/repos/threads-repo'
import { createThreadSchema, updateThreadSchema } from '../validators/threads-validator'

type RegisterThreadsRouteOptions = {
  threadsRepo: ThreadsRepository
  assistantsRepo?: AssistantsRepository
  channelThreadBindingsRepo?: Pick<ChannelThreadBindingsRepository, 'listByThreadIds'>
}

type ThreadChannelBindingInfo = {
  channelId: string
  remoteChatId: string
  createdAt: string
}

type ThreadResponse = AppThread & {
  channelBinding: ThreadChannelBindingInfo | null
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

function toThreadResponse(
  thread: AppThread,
  binding: ThreadChannelBindingInfo | null
): ThreadResponse {
  return {
    ...thread,
    channelBinding: binding
  }
}

export function registerThreadsRoute(app: Hono, options: RegisterThreadsRouteOptions): void {
  app.get('/v1/threads', async (context) => {
    const assistantId = context.req.query('assistantId')
    if (!assistantId) {
      return context.json({ ok: false, error: 'assistantId query is required' }, 400)
    }

    const includeHidden = context.req.query('includeHidden') === 'true'
    const threads = await options.threadsRepo.listByAssistant(assistantId, { includeHidden })
    if (!options.channelThreadBindingsRepo || threads.length === 0) {
      return context.json(threads.map((thread) => toThreadResponse(thread, null)))
    }

    const bindings = await options.channelThreadBindingsRepo.listByThreadIds(
      threads.map((thread) => thread.id)
    )
    const bindingByThreadId = new Map<string, ThreadChannelBindingInfo>()
    for (const binding of bindings) {
      if (!bindingByThreadId.has(binding.threadId)) {
        bindingByThreadId.set(binding.threadId, {
          channelId: binding.channelId,
          remoteChatId: binding.remoteChatId,
          createdAt: binding.createdAt
        })
      }
    }

    return context.json(
      threads.map((thread) => toThreadResponse(thread, bindingByThreadId.get(thread.id) ?? null))
    )
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
    return context.json(toThreadResponse(thread, null), 201)
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

    return context.json(toThreadResponse(thread, null))
  })

  app.delete('/v1/threads/:threadId', async (context) => {
    const deleted = await options.threadsRepo.delete(context.req.param('threadId'))
    if (!deleted) {
      return context.json({ ok: false, error: 'Thread not found' }, 404)
    }

    return context.body(null, 204)
  })
}
