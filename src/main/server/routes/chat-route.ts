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

type RegisterChatRouteOptions = {
  assistantRuntime: AssistantRuntime
}

export function registerChatRoute(app: Hono, options: RegisterChatRouteOptions): void {
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
        trigger: parsed.data.trigger
      })

      return createUIMessageStreamResponse({
        stream: stream as any
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
