import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { AssistantRuntime } from '../../mastra/assistant-runtime'
import { isChatRouteError } from '../chat/chat-errors'
import { ResumableChatStreams } from '../chat/resumable-chat-streams'

const chatRequestSchema = z.object({
  id: z.string().min(1).optional(),
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
  const resumableStreams = new ResumableChatStreams()

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

  app.get('/chat/:assistantId/:chatId/stream', async (context) => {
    const chatId = context.req.param('chatId')
    const stream = resumableStreams.resume(chatId)
    if (!stream) {
      return new Response(null, { status: 204 })
    }

    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: UI_MESSAGE_STREAM_HEADERS
    })
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
      console.log(parsed.error.issues)
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const assistantId = context.req.param('assistantId')
      const stream = await options.assistantRuntime.streamChat({
        assistantId,
        messages: parsed.data.messages,
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId,
        trigger: parsed.data.trigger,
        abortSignal: context.req.raw.signal
      })

      const chatId = parsed.data.id ?? `${assistantId}:${parsed.data.threadId}`
      return createUIMessageStreamResponse({
        stream,
        consumeSseStream: ({ stream: sseStream }) => {
          resumableStreams.register(chatId, sseStream)
        }
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
