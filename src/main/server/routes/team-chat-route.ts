import { createUIMessageStreamResponse } from 'ai'
import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import type { TeamRuntime } from '../../mastra/team-runtime'
import { isChatRouteError } from '../chat/chat-errors'
import type { TeamRunStatusStore } from '../chat/team-run-status-store'

const teamChatRequestSchema = z.object({
  messages: z.array(z.any()),
  profileId: z.string().min(1),
  trigger: z.enum(['submit-message', 'regenerate-message']).optional()
})

const teamChatHistoryQuerySchema = z.object({
  profileId: z.string().min(1)
})

type RegisterTeamChatRouteOptions = {
  teamRuntime: TeamRuntime
  teamRunStatusStore: TeamRunStatusStore
}

export function registerTeamChatRoute(app: Hono, options: RegisterTeamChatRouteOptions): void {
  app.get('/team-chat/:threadId/history', async (context) => {
    const parsed = teamChatHistoryQuerySchema.safeParse({
      profileId: context.req.query('profileId')
    })

    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const messages = await options.teamRuntime.listTeamThreadMessages({
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
          code: 'team_chat_history_error',
          error: 'Failed to load team thread history'
        },
        500
      )
    }
  })

  app.get('/team-chat/:threadId/runs/:runId/status', async (context) => {
    const stream = options.teamRunStatusStore.createStatusStream(
      context.req.param('runId'),
      context.req.param('threadId')
    )
    if (!stream) {
      return context.json({ ok: false, error: 'Team run not found' }, 404)
    }

    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    })
  })

  app.post('/team-chat/:threadId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json({ ok: false, error: 'Invalid JSON body' }, 400)
    }

    const parsed = teamChatRequestSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const result = await options.teamRuntime.streamTeamChat({
        threadId: context.req.param('threadId'),
        profileId: parsed.data.profileId,
        messages: parsed.data.messages,
        trigger: parsed.data.trigger,
        abortSignal: context.req.raw.signal
      })

      return createUIMessageStreamResponse({
        stream: result.stream,
        headers: {
          'x-team-run-id': result.runId
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
          code: 'team_chat_stream_error',
          error: 'Failed to stream team response'
        },
        500
      )
    }
  })
}
