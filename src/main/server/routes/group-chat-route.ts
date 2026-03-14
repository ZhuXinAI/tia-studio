import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import type { GroupRuntime } from '../../mastra/group-runtime'
import { isChatRouteError } from '../chat/chat-errors'
import type { GroupRunStatusStore } from '../chat/group-run-status-store'
import type { GroupThreadEventsStore } from '../chat/group-thread-events-store'
import { logger } from '../../utils/logger'

const groupChatHistoryQuerySchema = z.object({
  profileId: z.string().trim().min(1)
})

const groupChatMessageSchema = z.object({
  profileId: z.string().trim().min(1),
  content: z.string().trim().min(1),
  mentions: z.array(z.string().trim().min(1)).optional()
})

type RegisterGroupChatRouteOptions = {
  groupRuntime: GroupRuntime
  groupRunStatusStore?: GroupRunStatusStore
  groupThreadEventsStore?: GroupThreadEventsStore
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

function createSseResponse(stream: ReadableStream<string>): Response {
  const sseStream = stream.pipeThrough(
    new TransformStream<string, string>({
      start(controller) {
        // Flush the connection immediately so Electron receives live SSE chunks promptly.
        controller.enqueue(': connected\n\n')
      },
      transform(chunk, controller) {
        controller.enqueue(chunk)
      }
    })
  )

  return new Response(sseStream.pipeThrough(new TextEncoderStream()), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}

export function registerGroupChatRoute(
  app: Hono,
  options: RegisterGroupChatRouteOptions
): void {
  app.get('/group-chat/:threadId/history', async (context) => {
    const parsed = groupChatHistoryQuerySchema.safeParse({
      profileId: context.req.query('profileId')
    })

    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const messages = await options.groupRuntime.listGroupThreadMessages({
        threadId: context.req.param('threadId'),
        profileId: parsed.data.profileId
      })
      return context.json(messages)
    } catch (error) {
      if (isChatRouteError(error)) {
        return context.json(
          {
            ok: false,
            code: error.code,
            error: error.message
          },
          {
            status: error.statusCode as ContentfulStatusCode
          }
        )
      }

      return context.json(
        {
          ok: false,
          code: 'group_chat_history_error',
          error: 'Failed to load group thread history'
        },
        500
      )
    }
  })

  app.get('/group-chat/:threadId/events', async (context) => {
    if (!options.groupThreadEventsStore) {
      return context.json({ ok: false, error: 'Group thread events are unavailable' }, 503)
    }

    const parsed = groupChatHistoryQuerySchema.safeParse({
      profileId: context.req.query('profileId')
    })

    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      await options.groupRuntime.listGroupThreadMessages({
        threadId: context.req.param('threadId'),
        profileId: parsed.data.profileId
      })
    } catch (error) {
      if (isChatRouteError(error)) {
        return context.json(
          {
            ok: false,
            code: error.code,
            error: error.message
          },
          {
            status: error.statusCode as ContentfulStatusCode
          }
        )
      }

      return context.json(
        {
          ok: false,
          code: 'group_chat_events_error',
          error: 'Failed to open group thread events'
        },
        500
      )
    }

    const stream = options.groupThreadEventsStore.createThreadStream({
      threadId: context.req.param('threadId'),
      profileId: parsed.data.profileId
    })
    logger.info('[GroupFlow] Opened group thread events stream', {
      threadId: context.req.param('threadId'),
      profileId: parsed.data.profileId
    })
    return createSseResponse(stream)
  })

  app.get('/group-chat/:threadId/runs/:runId/status', async (context) => {
    if (!options.groupRunStatusStore) {
      return context.json({ ok: false, error: 'Group run status is unavailable' }, 503)
    }

    const stream = options.groupRunStatusStore.createStatusStream(
      context.req.param('runId'),
      context.req.param('threadId')
    )
    if (!stream) {
      logger.warn('[GroupFlow] Group status stream requested before run was available', {
        threadId: context.req.param('threadId'),
        runId: context.req.param('runId')
      })
      return context.json({ ok: false, error: 'Group run not found' }, 404)
    }

    logger.info('[GroupFlow] Opened group status stream', {
      threadId: context.req.param('threadId'),
      runId: context.req.param('runId')
    })
    return createSseResponse(stream)
  })

  app.post('/group-chat/:threadId/messages', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = groupChatMessageSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const result = await options.groupRuntime.submitWatcherMessage({
        threadId: context.req.param('threadId'),
        profileId: parsed.data.profileId,
        content: parsed.data.content,
        mentions: parsed.data.mentions
      })

      logger.info('[GroupFlow] Group message request accepted', {
        threadId: context.req.param('threadId'),
        profileId: parsed.data.profileId,
        runId: result.runId,
        messageId: result.messageId
      })

      return new Response(JSON.stringify(result), {
        status: 202,
        headers: {
          'Content-Type': 'application/json',
          'x-group-run-id': result.runId
        }
      })
    } catch (error) {
      if (isChatRouteError(error)) {
        return context.json(
          {
            ok: false,
            code: error.code,
            error: error.message
          },
          {
            status: error.statusCode as ContentfulStatusCode
          }
        )
      }

      return context.json(
        {
          ok: false,
          code: 'group_chat_submit_error',
          error: 'Failed to submit group watcher message'
        },
        500
      )
    }
  })
}
