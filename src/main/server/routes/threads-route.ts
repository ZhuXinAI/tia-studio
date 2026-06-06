import type { Hono } from 'hono'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { ChannelThreadBindingsRepository } from '../../persistence/repos/channel-thread-bindings-repo'
import type { ProvidersRepository } from '../../persistence/repos/providers-repo'
import type { AppThread, ThreadsRepository } from '../../persistence/repos/threads-repo'
import type { WorkspacesRepository } from '../../persistence/repos/workspaces-repo'
import { createThreadSchema, updateThreadSchema } from '../validators/threads-validator'

type RegisterThreadsRouteOptions = {
  threadsRepo: ThreadsRepository
  assistantsRepo?: AssistantsRepository
  providersRepo?: Pick<ProvidersRepository, 'getById'>
  workspacesRepo?: Pick<WorkspacesRepository, 'getById'>
  channelThreadBindingsRepo?: Pick<ChannelThreadBindingsRepository, 'listByThreadIds'>
  threadUsageRepo?: {
    listThreadTotals(threadIds: string[]): Promise<
      Record<
        string,
        {
          assistantMessageCount: number
          inputTokens: number
          outputTokens: number
          totalTokens: number
          reasoningTokens: number
          cachedInputTokens: number
        }
      >
    >
  }
}

type ThreadChannelBindingInfo = {
  channelId: string
  remoteChatId: string
  createdAt: string
}

type ThreadResponse = AppThread & {
  channelBinding: ThreadChannelBindingInfo | null
  usageTotals?: {
    assistantMessageCount: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    reasoningTokens: number
    cachedInputTokens: number
  } | null
}

function toUsageTotalsResponse(
  usageTotals:
    | {
        assistantMessageCount: number
        inputTokens: number
        outputTokens: number
        totalTokens: number
        reasoningTokens: number
        cachedInputTokens: number
      }
    | {
        threadId: string
        assistantMessageCount: number
        inputTokens: number
        outputTokens: number
        totalTokens: number
        reasoningTokens: number
        cachedInputTokens: number
      }
    | null
): ThreadResponse['usageTotals'] {
  if (!usageTotals) {
    return null
  }

  return {
    assistantMessageCount: usageTotals.assistantMessageCount,
    inputTokens: usageTotals.inputTokens,
    outputTokens: usageTotals.outputTokens,
    totalTokens: usageTotals.totalTokens,
    reasoningTokens: usageTotals.reasoningTokens,
    cachedInputTokens: usageTotals.cachedInputTokens
  }
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

function toThreadResponse(
  thread: AppThread,
  binding: ThreadChannelBindingInfo | null,
  usageTotals: ThreadResponse['usageTotals'] = null
): ThreadResponse {
  return {
    ...thread,
    channelBinding: binding,
    usageTotals
  }
}

export function registerThreadsRoute(app: Hono, options: RegisterThreadsRouteOptions): void {
  app.get('/v1/threads', async (context) => {
    const assistantId = context.req.query('assistantId')
    const workspaceId = context.req.query('workspaceId')
    if (!assistantId && !workspaceId) {
      return context.json({ ok: false, error: 'assistantId or workspaceId query is required' }, 400)
    }

    const includeHidden = context.req.query('includeHidden') === 'true'
    const threads = workspaceId
      ? await options.threadsRepo.listByWorkspace(workspaceId, { includeHidden })
      : await options.threadsRepo.listByAssistant(assistantId!, { includeHidden })
    const usageTotalsByThreadId = options.threadUsageRepo
      ? await options.threadUsageRepo.listThreadTotals(threads.map((thread) => thread.id))
      : {}

    if (!options.channelThreadBindingsRepo || threads.length === 0) {
      return context.json(
        threads.map((thread) =>
          toThreadResponse(
            thread,
            null,
            toUsageTotalsResponse(usageTotalsByThreadId[thread.id] ?? null)
          )
        )
      )
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
      threads.map((thread) =>
        toThreadResponse(
          thread,
          bindingByThreadId.get(thread.id) ?? null,
          toUsageTotalsResponse(usageTotalsByThreadId[thread.id] ?? null)
        )
      )
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

    if (parsed.data.workspaceId && options.workspacesRepo) {
      const workspace = await options.workspacesRepo.getById(parsed.data.workspaceId)
      if (!workspace) {
        return context.json({ ok: false, error: 'Workspace not found' }, 400)
      }
    }

    if (parsed.data.providerOverride && options.providersRepo) {
      const provider = await options.providersRepo.getById(parsed.data.providerOverride.providerId)
      if (!provider) {
        return context.json({ ok: false, error: 'Provider not found' }, 400)
      }
    }

    const metadata: Record<string, unknown> = {}
    if (parsed.data.workspaceId) {
      metadata.workspaceId = parsed.data.workspaceId
    }

    if (parsed.data.providerOverride) {
      metadata.providerOverride = {
        providerId: parsed.data.providerOverride.providerId,
        model: parsed.data.providerOverride.model
      }
    }

    const thread = await options.threadsRepo.create({
      assistantId: parsed.data.assistantId,
      resourceId: parsed.data.resourceId,
      title: parsed.data.title,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    })
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
