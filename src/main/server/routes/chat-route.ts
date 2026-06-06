import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { AssistantRuntime } from '../../mastra/assistant-runtime'
import type { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { parseThreadSlashCommand } from '../../chat/thread-slash-commands'
import { ChatRouteError, isChatRouteError } from '../chat/chat-errors'
import { ResumableChatStreams } from '../chat/resumable-chat-streams'
import { logger } from '../../utils/logger'

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

const threadCommandRequestSchema = z.object({
  text: z.string().min(1),
  threadId: z.string().min(1),
  profileId: z.string().min(1)
})

type RegisterChatRouteOptions = {
  assistantRuntime: AssistantRuntime
  threadsRepo?: Pick<ThreadsRepository, 'getById'>
  threadMessageEventsStore?: {
    createAssistantStream(input: { assistantId: string; profileId: string }): ReadableStream<string>
  }
}

export function registerChatRoute(app: Hono, options: RegisterChatRouteOptions): void {
  const resumableStreams = new ResumableChatStreams()
  const activeRuns = new Map<string, AbortController>()

  const resolveAssistantId = async (input: {
    explicitAssistantId?: string | undefined
    threadId?: string | undefined
  }): Promise<string> => {
    if (input.explicitAssistantId) {
      return input.explicitAssistantId
    }

    if (!input.threadId || !options.threadsRepo) {
      throw new ChatRouteError(404, 'thread_not_found', 'Thread not found')
    }

    const thread = await options.threadsRepo.getById(input.threadId)
    if (!thread) {
      throw new ChatRouteError(404, 'thread_not_found', 'Thread not found')
    }

    return thread.assistantId
  }

  const toRunKey = (input: { assistantId: string; threadId: string; profileId: string }): string =>
    `${input.assistantId}:${input.threadId}:${input.profileId}`

  const stopActiveRun = (input: {
    assistantId: string
    threadId: string
    profileId: string
    reason: string
  }): boolean => {
    const key = toRunKey(input)
    const controller = activeRuns.get(key)
    if (!controller) {
      return false
    }

    controller.abort(input.reason)
    return true
  }

  const registerActiveRun = (input: {
    assistantId: string
    threadId: string
    profileId: string
  }) => {
    const key = toRunKey(input)
    const controller = new AbortController()

    activeRuns.set(key, controller)

    const cleanup = (): void => {
      if (activeRuns.get(key) === controller) {
        activeRuns.delete(key)
      }
    }

    return {
      abortSignal: controller.signal,
      cleanup
    }
  }

  const withRunCleanup = <T>(stream: ReadableStream<T>, cleanup: () => void): ReadableStream<T> => {
    let reader: ReadableStreamDefaultReader<T> | null = null
    let didCleanup = false

    const runCleanup = (): void => {
      if (didCleanup) {
        return
      }

      didCleanup = true
      cleanup()
    }

    return new ReadableStream<T>({
      start(controller) {
        reader = stream.getReader()

        const pump = async (): Promise<void> => {
          try {
            while (true) {
              const { done, value } = await reader!.read()
              if (done) {
                runCleanup()
                controller.close()
                return
              }

              controller.enqueue(value)
            }
          } catch (error) {
            runCleanup()
            controller.error(error)
          } finally {
            reader?.releaseLock()
            reader = null
          }
        }

        void pump()
      },
      cancel(reason) {
        return reader?.cancel(reason)
      }
    })
  }

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
      const assistantId = await resolveAssistantId({
        explicitAssistantId: context.req.param('assistantId'),
        threadId: parsed.data.threadId
      })
      const messages = await options.assistantRuntime.listThreadMessages({
        assistantId,
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

  app.get('/chat/history', async (context) => {
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
      const assistantId = await resolveAssistantId({
        threadId: parsed.data.threadId
      })
      const messages = await options.assistantRuntime.listThreadMessages({
        assistantId,
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
    const stream = await resumableStreams.resume(chatId)
    if (!stream) {
      return new Response(null, { status: 204 })
    }

    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: UI_MESSAGE_STREAM_HEADERS
    })
  })

  app.get('/chat/stream/:chatId', async (context) => {
    const chatId = context.req.param('chatId')
    const stream = await resumableStreams.resume(chatId)
    if (!stream) {
      return new Response(null, { status: 204 })
    }

    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: UI_MESSAGE_STREAM_HEADERS
    })
  })

  app.post('/chat/:assistantId/commands', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json({ ok: false, error: 'Invalid JSON body' }, 400)
    }

    const parsed = threadCommandRequestSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const assistantId = await resolveAssistantId({
        explicitAssistantId: context.req.param('assistantId'),
        threadId: parsed.data.threadId
      })
      const command = parseThreadSlashCommand(parsed.data.text)

      if (!command) {
        return context.json({
          ok: true,
          handled: false
        })
      }

      if (command === 'stop') {
        const stopped = stopActiveRun({
          assistantId,
          threadId: parsed.data.threadId,
          profileId: parsed.data.profileId,
          reason: 'Stopped by slash command'
        })

        return context.json({
          ok: true,
          handled: true,
          command: 'stop',
          stopped
        })
      }

      stopActiveRun({
        assistantId,
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId,
        reason: 'Reset by /new slash command'
      })

      const result = await options.assistantRuntime.runThreadCommand({
        assistantId,
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId,
        command: 'new'
      })

      return context.json({
        ok: true,
        handled: true,
        ...result
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
          code: 'chat_command_error',
          error: 'Failed to run thread command'
        },
        500
      )
    }
  })

  app.post('/chat/commands', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json({ ok: false, error: 'Invalid JSON body' }, 400)
    }

    const parsed = threadCommandRequestSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const assistantId = await resolveAssistantId({
        threadId: parsed.data.threadId
      })
      const command = parseThreadSlashCommand(parsed.data.text)

      if (!command) {
        return context.json({
          ok: true,
          handled: false
        })
      }

      if (command === 'stop') {
        const stopped = stopActiveRun({
          assistantId,
          threadId: parsed.data.threadId,
          profileId: parsed.data.profileId,
          reason: 'Stopped by slash command'
        })

        return context.json({
          ok: true,
          handled: true,
          command: 'stop',
          stopped
        })
      }

      stopActiveRun({
        assistantId,
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId,
        reason: 'Reset by /new slash command'
      })

      const result = await options.assistantRuntime.runThreadCommand({
        assistantId,
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId,
        command: 'new'
      })

      return context.json({
        ok: true,
        handled: true,
        ...result
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
          code: 'chat_command_error',
          error: 'Failed to run thread command'
        },
        500
      )
    }
  })

  app.get('/chat/:assistantId/events', async (context) => {
    if (!options.threadMessageEventsStore) {
      return context.json({ ok: false, error: 'Chat thread events are unavailable' }, 503)
    }

    const parsed = z
      .object({
        profileId: z.string().min(1)
      })
      .safeParse({
        profileId: context.req.query('profileId')
      })

    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const stream = options.threadMessageEventsStore.createAssistantStream({
      assistantId: context.req.param('assistantId'),
      profileId: parsed.data.profileId
    })

    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    })
  })

  app.get('/chat/events', async (context) => {
    if (!options.threadMessageEventsStore) {
      return context.json({ ok: false, error: 'Chat thread events are unavailable' }, 503)
    }

    const parsed = z
      .object({
        profileId: z.string().min(1),
        threadId: z.string().min(1)
      })
      .safeParse({
        profileId: context.req.query('profileId'),
        threadId: context.req.query('threadId')
      })

    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const assistantId = await resolveAssistantId({
        threadId: parsed.data.threadId
      })
      const stream = options.threadMessageEventsStore.createAssistantStream({
        assistantId,
        profileId: parsed.data.profileId
      })

      return new Response(stream.pipeThrough(new TextEncoderStream()), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
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
          code: 'chat_events_error',
          error: 'Failed to open thread events'
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
      logger.warn('Chat request validation failed:', parsed.error.issues)
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    let activeRun: ReturnType<typeof registerActiveRun> | null = null

    try {
      const assistantId = await resolveAssistantId({
        explicitAssistantId: context.req.param('assistantId'),
        threadId: parsed.data.threadId
      })
      activeRun = registerActiveRun({
        assistantId,
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId
      })
      const stream = await options.assistantRuntime.streamChat({
        assistantId,
        messages: parsed.data.messages,
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId,
        trigger: parsed.data.trigger,
        abortSignal: activeRun.abortSignal
      })
      const streamWithCleanup = withRunCleanup(stream, activeRun.cleanup)

      const chatId = parsed.data.id ?? `${assistantId}:${parsed.data.threadId}`
      return createUIMessageStreamResponse({
        stream: streamWithCleanup,
        consumeSseStream: async ({ stream: sseStream }) => {
          try {
            await resumableStreams.register(chatId, sseStream)
          } catch (error) {
            logger.error('[ChatRoute] Failed to register resumable chat stream', {
              assistantId,
              chatId,
              threadId: parsed.data.threadId,
              profileId: parsed.data.profileId,
              error
            })
          }
        }
      })
    } catch (error) {
      activeRun?.cleanup()

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

      console.error(error)

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

  app.post('/chat', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json({ ok: false, error: 'Invalid JSON body' }, 400)
    }

    const parsed = chatRequestSchema.safeParse(body)
    if (!parsed.success) {
      logger.warn('Chat request validation failed:', parsed.error.issues)
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    let activeRun: ReturnType<typeof registerActiveRun> | null = null

    try {
      const assistantId = await resolveAssistantId({
        threadId: parsed.data.threadId
      })
      activeRun = registerActiveRun({
        assistantId,
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId
      })
      const stream = await options.assistantRuntime.streamChat({
        assistantId,
        messages: parsed.data.messages,
        threadId: parsed.data.threadId,
        profileId: parsed.data.profileId,
        trigger: parsed.data.trigger,
        abortSignal: activeRun.abortSignal
      })
      const streamWithCleanup = withRunCleanup(stream, activeRun.cleanup)

      const chatId = parsed.data.id ?? parsed.data.threadId
      return createUIMessageStreamResponse({
        stream: streamWithCleanup,
        consumeSseStream: async ({ stream: sseStream }) => {
          try {
            await resumableStreams.register(chatId, sseStream)
          } catch (error) {
            logger.error('[ChatRoute] Failed to register resumable chat stream', {
              assistantId,
              chatId,
              threadId: parsed.data.threadId,
              profileId: parsed.data.profileId,
              error
            })
          }
        }
      })
    } catch (error) {
      activeRun?.cleanup()

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

      console.error(error)

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
