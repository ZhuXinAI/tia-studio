import { createUIMessageStreamResponse } from 'ai'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { AssistantRuntime } from '../../mastra/assistant-runtime'
import { isChatRouteError } from '../chat/chat-errors'

const chatRequestSchema = z.object({
  messages: z.array(z.any()),
  threadId: z.string().min(1),
  profileId: z.string().min(1),
  trigger: z.enum(['submit-message', 'regenerate-message']).optional()
})

const chatHistoryQuerySchema = z.object({
  threadId: z.string().min(1),
  profileId: z.string().min(1)
})

type RegisterChatRouteOptions = {
  assistantRuntime: AssistantRuntime
}

export function registerChatRoute(app: Hono, options: RegisterChatRouteOptions): void {
  app.get('/chat/:assistantId/history', async (context) => {
    const parsed = chatHistoryQuerySchema.safeParse({
      threadId: context.req.query('threadId'),
      profileId: context.req.query('profileId')
    })

    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const messages = await options.assistantRuntime.listThreadMessages({
        assistantId: context.req.param('assistantId'),
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId
      })

      return context.json(messages)
    } catch (error) {
      if (isChatRouteError(error)) {
        return new Response(
          JSON.stringify({
            ok: false,
            code: error.code,
            error: error.message
          }),
          {
            status: error.statusCode,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
      }

      return context.json(
        {
          ok: false,
          code: 'chat_history_error',
          error: 'Failed to load thread history'
        },
        500
      )
    }
  })

  app.post('/chat/:assistantId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json({ ok: false, error: 'Invalid JSON body' }, 400)
    }

    const parsed = chatRequestSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const stream = await options.assistantRuntime.streamChat({
        assistantId: context.req.param('assistantId'),
        messages: parsed.data.messages,
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId,
        trigger: parsed.data.trigger,
        abortSignal: context.req.raw.signal
      })

      return createUIMessageStreamResponse({
        stream
      })
    } catch (error) {
      if (isChatRouteError(error)) {
        return new Response(
          JSON.stringify({
            ok: false,
            code: error.code,
            error: error.message
          }),
          {
            status: error.statusCode,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
      }

      return context.json(
        {
          ok: false,
          code: 'chat_stream_error',
          error: 'Failed to stream assistant response'
        },
        500
      )
    }
  })
}
