import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UIMessageChunk } from 'ai'
import type { AssistantRuntime } from '../mastra/assistant-runtime'
import type { AppDatabase } from '../persistence/client'
import { migrateAppSchema } from '../persistence/migrate'
import { AssistantsRepository } from '../persistence/repos/assistants-repo'
import { ChannelThreadBindingsRepository } from '../persistence/repos/channel-thread-bindings-repo'
import { ChannelsRepository } from '../persistence/repos/channels-repo'
import { ProvidersRepository } from '../persistence/repos/providers-repo'
import { ThreadsRepository } from '../persistence/repos/threads-repo'
import { ChannelEventBus } from './channel-event-bus'
import { ChannelMessageRouter } from './channel-message-router'

function createStream(chunks: UIMessageChunk[] = []): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    }
  })
}

function createAssistantReplyStream(text: string): ReadableStream<UIMessageChunk> {
  return createStream(
    text.length === 0
      ? []
      : [
          { type: 'start' } as UIMessageChunk,
          { type: 'text-start', id: 'text-1' } as UIMessageChunk,
          { type: 'text-delta', id: 'text-1', delta: text } as UIMessageChunk,
          { type: 'text-end', id: 'text-1' } as UIMessageChunk,
          { type: 'finish' } as UIMessageChunk
        ]
  )
}

function createAssistantRuntimeStub(streamChat: AssistantRuntime['streamChat']): AssistantRuntime {
  return {
    streamChat,
    listThreadMessages: vi.fn(async () => []),
    runCronJob: vi.fn(async () => ({ outputText: '' })),
    runHeartbeat: vi.fn(async () => ({ outputText: '' }))
  }
}

function createDeferredAssistantReplyStream() {
  let controller: ReadableStreamDefaultController<UIMessageChunk> | null = null
  let settled = false

  const stream = new ReadableStream<UIMessageChunk>({
    start(nextController) {
      controller = nextController
      nextController.enqueue({ type: 'start' } as UIMessageChunk)
      nextController.enqueue({ type: 'text-start', id: 'text-1' } as UIMessageChunk)
    }
  })

  return {
    stream,
    bindAbortSignal(signal: AbortSignal | undefined) {
      if (!signal) {
        return
      }

      signal.addEventListener(
        'abort',
        () => {
          if (!controller || settled) {
            return
          }

          settled = true
          const abortError = new Error('Aborted')
          abortError.name = 'AbortError'
          controller.error(abortError)
        },
        { once: true }
      )
    },
    finish(text: string) {
      if (!controller || settled) {
        return
      }

      settled = true
      if (text.length > 0) {
        controller.enqueue({ type: 'text-delta', id: 'text-1', delta: text } as UIMessageChunk)
      }
      controller.enqueue({ type: 'text-end', id: 'text-1' } as UIMessageChunk)
      controller.enqueue({ type: 'finish' } as UIMessageChunk)
      controller.close()
    },
    failWithErrorText(errorText: string) {
      if (!controller || settled) {
        return
      }

      settled = true
      controller.enqueue({ type: 'error', errorText } as UIMessageChunk)
      controller.close()
    }
  }
}

async function expectEventually(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  throw lastError
}

function createInboundEvent(input: {
  eventId: string
  channelId: string
  channelType?: 'lark' | 'telegram'
  messageId: string
  remoteChatId?: string
  senderId?: string
  content: string
}) {
  return {
    eventId: input.eventId,
    channelId: input.channelId,
    channelType: input.channelType ?? 'lark',
    message: {
      id: input.messageId,
      remoteChatId: input.remoteChatId ?? 'oc_123',
      senderId: input.senderId ?? 'ou_user',
      content: input.content,
      timestamp: new Date('2026-03-10T00:00:00.000Z')
    }
  } as const
}

describe('ChannelMessageRouter', () => {
  let db: AppDatabase
  let eventBus: ChannelEventBus
  let channelsRepo: ChannelsRepository
  let bindingsRepo: ChannelThreadBindingsRepository
  let threadsRepo: ThreadsRepository
  let assistantId: string
  let channelId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    eventBus = new ChannelEventBus()
    channelsRepo = new ChannelsRepository(db)
    bindingsRepo = new ChannelThreadBindingsRepository(db)
    threadsRepo = new ThreadsRepository(db)

    const providersRepo = new ProvidersRepository(db)
    const assistantsRepo = new AssistantsRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistant = await assistantsRepo.create({
      name: 'Support Assistant',
      providerId: provider.id,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'lark',
      name: 'Lark',
      assistantId: assistant.id,
      enabled: true,
      config: {
        appId: 'cli_xxx',
        appSecret: 'secret'
      }
    })

    assistantId = assistant.id
    channelId = channel.id
  })

  afterEach(() => {
    db.close()
  })

  it('creates one local thread per remote lark conversation and reuses it', async () => {
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () => createStream())
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    await router.handleInboundEvent({
      eventId: 'evt-1',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-1',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    await router.handleInboundEvent({
      eventId: 'evt-2',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-2',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'follow up',
        timestamp: new Date('2026-03-08T00:01:00.000Z')
      }
    })

    const binding = await bindingsRepo.getByChannelAndRemoteChat(channelId, 'oc_123')
    const threads = await threadsRepo.listByAssistant(assistantId)

    expect(binding).toMatchObject({
      channelId,
      remoteChatId: 'oc_123'
    })
    expect(threads).toHaveLength(1)
    expect(threads[0]).toMatchObject({
      assistantId,
      resourceId: 'default-profile',
      title: 'New Thread'
    })
    expect(streamChat).toHaveBeenCalledTimes(2)
    expect(streamChat).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        assistantId,
        threadId: binding?.threadId,
        profileId: 'default-profile',
        messages: [
          {
            id: `channel:${channelId}:msg-1`,
            content: 'hello',
            role: 'user',
            parts: [{ type: 'text', text: 'hello' }],
            metadata: {
              fromChannel: 'lark',
              channelId,
              channelType: 'lark',
              remoteChatId: 'oc_123',
              remoteMessageId: 'msg-1',
              senderId: 'ou_user'
            }
          }
        ]
      })
    )
    expect(streamChat).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        threadId: binding?.threadId,
        messages: [
          expect.objectContaining({
            id: `channel:${channelId}:msg-2`
          })
        ]
      })
    )
  })

  it('subscribes to inbound channel events', async () => {
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () => createStream())
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    await router.start()
    await eventBus.publish('channel.message.received', {
      eventId: 'evt-1',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-1',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(streamChat).toHaveBeenCalledOnce()

    await router.stop()
  })

  it('preserves the actual channel type and transport metadata for telegram messages', async () => {
    const telegramChannel = await channelsRepo.create({
      type: 'telegram',
      name: 'Telegram',
      assistantId,
      enabled: true,
      config: {
        botToken: '123456:test-token'
      }
    })
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () => createStream())
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    await router.handleInboundEvent({
      eventId: 'evt-telegram',
      channelId: telegramChannel.id,
      channelType: 'telegram',
      message: {
        id: '42',
        remoteChatId: '1001',
        senderId: '1001',
        content: 'hello from telegram',
        timestamp: new Date('2026-03-09T00:10:00.000Z'),
        metadata: {
          telegramUsername: 'alice',
          telegramDisplayName: 'Alice'
        }
      }
    })

    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId,
        profileId: 'default-profile',
        messages: [
          expect.objectContaining({
            id: `channel:${telegramChannel.id}:42`,
            metadata: {
              fromChannel: 'telegram',
              channelId: telegramChannel.id,
              channelType: 'telegram',
              remoteChatId: '1001',
              remoteMessageId: '42',
              senderId: '1001',
              telegramUsername: 'alice',
              telegramDisplayName: 'Alice'
            }
          })
        ]
      })
    )
  })

  it('passes channel target metadata to the runtime for progressive outbound delivery', async () => {
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () => createStream())
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    await router.handleInboundEvent({
      eventId: 'evt-1',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-1',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId,
        profileId: 'default-profile',
        channelTarget: {
          channelId,
          channelType: 'lark',
          remoteChatId: 'oc_123'
        }
      })
    )
  })

  it('does not publish a send request after the assistant finishes', async () => {
    const publishedEvents: unknown[] = []
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () =>
      createAssistantReplyStream('Hello from assistant')
    )
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    eventBus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    await router.handleInboundEvent({
      eventId: 'evt-1',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-1',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(publishedEvents).toEqual([])
  })

  it('publishes a fallback error when the assistant text is empty', async () => {
    const publishedEvents: unknown[] = []
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () =>
      createAssistantReplyStream('')
    )
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    eventBus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    await router.handleInboundEvent({
      eventId: 'evt-1',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-1',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(publishedEvents).toEqual([
      expect.objectContaining({
        channelId,
        remoteChatId: 'oc_123',
        content: '[Error] Failed to generate a response. Please try again.'
      })
    ])
  })

  it('does not publish tool-start or tool-error updates to the channel', async () => {
    const publishedEvents: unknown[] = []
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () =>
      createStream([
        { type: 'start' } as UIMessageChunk,
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-1',
          toolName: 'mastra_workspace_read_file'
        } as UIMessageChunk,
        {
          type: 'tool-output-error',
          toolCallId: 'tool-call-1',
          errorText: 'File not found'
        } as UIMessageChunk,
        { type: 'text-start', id: 'text-1' } as UIMessageChunk,
        { type: 'text-delta', id: 'text-1', delta: 'Hello from assistant' } as UIMessageChunk,
        { type: 'text-end', id: 'text-1' } as UIMessageChunk,
        { type: 'finish' } as UIMessageChunk
      ])
    )
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    eventBus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    await router.handleInboundEvent({
      eventId: 'evt-tool-noise',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-tool-noise',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(publishedEvents).toEqual([])
  })

  it('still publishes user-facing tool completion updates to the channel', async () => {
    const publishedEvents: unknown[] = []
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () =>
      createStream([
        { type: 'start' } as UIMessageChunk,
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-1',
          toolName: 'writeSoulMemory'
        } as UIMessageChunk,
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-1',
          output: { ok: true }
        } as UIMessageChunk,
        { type: 'text-start', id: 'text-1' } as UIMessageChunk,
        { type: 'text-delta', id: 'text-1', delta: 'All set.' } as UIMessageChunk,
        { type: 'text-end', id: 'text-1' } as UIMessageChunk,
        { type: 'finish' } as UIMessageChunk
      ])
    )
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    eventBus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    await router.handleInboundEvent({
      eventId: 'evt-tool-success',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-tool-success',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(publishedEvents).toEqual([
      expect.objectContaining({
        channelId,
        remoteChatId: 'oc_123',
        content: '✅ Memory saved'
      })
    ])
  })
  it('publishes a thread message updated event after processing inbound channel messages', async () => {
    const appendMessagesUpdated = vi.fn()
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () =>
      createAssistantReplyStream('Reply from assistant')
    )
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat),
      threadMessageEventsStore: {
        appendMessagesUpdated
      }
    })

    await router.handleInboundEvent({
      eventId: 'evt-thread-update',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-1',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(appendMessagesUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId,
        profileId: 'default-profile',
        source: 'channel'
      })
    )
  })

  it('returns a friendly 404 message for JSON error with statusCode 404', async () => {
    const publishedEvents: unknown[] = []
    const errorJson = JSON.stringify({
      message: 'Not Found',
      name: 'AI_APICallError',
      statusCode: 404,
      requestBodyValues: { model: 'test', messages: [{ role: 'user', content: 'secret' }] }
    })
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () =>
      createStream([{ type: 'error', errorText: errorJson } as UIMessageChunk])
    )
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    eventBus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    await router.handleInboundEvent({
      eventId: 'evt-stream-err',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-stream-err',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(publishedEvents).toHaveLength(1)
    const sent = publishedEvents[0] as { content: string }
    expect(sent.content).toBe(
      '[Error] The configured model or API endpoint was not found. Please check the provider settings.'
    )
    expect(sent.content).not.toContain('secret')
    expect(sent.content).not.toContain('requestBodyValues')
  })

  it('returns a friendly 401 message for JSON error with statusCode 401', async () => {
    const publishedEvents: unknown[] = []
    const errorJson = JSON.stringify({
      message: 'Unauthorized',
      name: 'AI_APICallError',
      statusCode: 401
    })
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () =>
      createStream([{ type: 'error', errorText: errorJson } as UIMessageChunk])
    )
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    eventBus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    await router.handleInboundEvent({
      eventId: 'evt-401',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-401',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(publishedEvents).toHaveLength(1)
    const sent = publishedEvents[0] as { content: string }
    expect(sent.content).toBe(
      '[Error] Authentication failed. Please check the API key in provider settings.'
    )
  })

  it('returns a friendly 429 message for rate limit errors', async () => {
    const publishedEvents: unknown[] = []
    const errorJson = JSON.stringify({
      message: 'Rate limit exceeded',
      statusCode: 429
    })
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () =>
      createStream([{ type: 'error', errorText: errorJson } as UIMessageChunk])
    )
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    eventBus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    await router.handleInboundEvent({
      eventId: 'evt-429',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-429',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(publishedEvents).toHaveLength(1)
    const sent = publishedEvents[0] as { content: string }
    expect(sent.content).toBe('[Error] Too many requests. Please wait a moment and try again.')
  })

  it('returns a friendly 500 message for server errors', async () => {
    const publishedEvents: unknown[] = []
    const errorJson = JSON.stringify({
      message: 'Internal Server Error',
      statusCode: 500
    })
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () =>
      createStream([{ type: 'error', errorText: errorJson } as UIMessageChunk])
    )
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    eventBus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    await router.handleInboundEvent({
      eventId: 'evt-500',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-500',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(publishedEvents).toHaveLength(1)
    const sent = publishedEvents[0] as { content: string }
    expect(sent.content).toBe(
      "[Error] The AI provider's server encountered an error. Please try again later."
    )
  })

  it('returns a friendly connection error for ECONNREFUSED / connection refused', async () => {
    const publishedEvents: unknown[] = []
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () =>
      createStream([{ type: 'error', errorText: 'Connection refused' } as UIMessageChunk])
    )
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    eventBus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    await router.handleInboundEvent({
      eventId: 'evt-stream-plain-err',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-stream-plain-err',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(publishedEvents).toHaveLength(1)
    const sent = publishedEvents[0] as { content: string }
    expect(sent.content).toBe(
      '[Error] Unable to connect to the AI provider. Please check the network and API host configuration.'
    )
  })

  it('returns a generic friendly error when streamChat throws an unclassified error', async () => {
    const publishedEvents: unknown[] = []
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () => {
      throw new Error('something went wrong internally')
    })
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    eventBus.subscribe('channel.message.send-requested', (event) => {
      publishedEvents.push(event)
    })

    await router.handleInboundEvent({
      eventId: 'evt-err',
      channelId,
      channelType: 'lark',
      message: {
        id: 'msg-err',
        remoteChatId: 'oc_123',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(publishedEvents).toHaveLength(1)
    const sent = publishedEvents[0] as { content: string }
    expect(sent.content).toBe(
      '[Error] Failed to generate a response. Please check the provider configuration.'
    )
  })

  it('queues a second inbound message while the current run is active', async () => {
    const firstRun = createDeferredAssistantReplyStream()
    let callIndex = 0
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async (params) => {
      callIndex += 1
      if (callIndex === 1) {
        firstRun.bindAbortSignal(params.abortSignal)
        return firstRun.stream
      }

      return createAssistantReplyStream('Second reply')
    })
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat),
      interruptionDecider: vi.fn(async () => ({
        decision: 'queue',
        reason: 'Got it — I’ll handle this right after the current reply.'
      }))
    } as never)
    const publishedEvents: string[] = []

    eventBus.subscribe('channel.message.send-requested', (event) => {
      if (typeof event.content === 'string') {
        publishedEvents.push(event.content)
      }
    })

    const firstPromise = router.handleInboundEvent(
      createInboundEvent({
        eventId: 'evt-queue-1',
        channelId,
        messageId: 'msg-queue-1',
        content: 'hello'
      })
    )
    await expectEventually(() => {
      expect(streamChat).toHaveBeenCalledTimes(1)
    })

    const secondPromise = router.handleInboundEvent(
      createInboundEvent({
        eventId: 'evt-queue-2',
        channelId,
        messageId: 'msg-queue-2',
        content: 'also tell me about pricing'
      })
    )

    await expectEventually(() => {
      expect(publishedEvents).toContain('Got it — I’ll handle this right after the current reply.')
    })
    expect(streamChat).toHaveBeenCalledTimes(1)

    firstRun.finish('First reply')

    await Promise.all([firstPromise, secondPromise])

    expect(streamChat).toHaveBeenCalledTimes(2)
    expect(streamChat).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: [expect.objectContaining({ content: 'also tell me about pricing' })]
      })
    )
  })

  it('interrupts the active run and aborts it before starting the newer message', async () => {
    const firstRun = createDeferredAssistantReplyStream()
    let firstAbortSignal: AbortSignal | undefined
    let callIndex = 0
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async (params) => {
      callIndex += 1
      if (callIndex === 1) {
        firstAbortSignal = params.abortSignal
        firstRun.bindAbortSignal(params.abortSignal)
        return firstRun.stream
      }

      return createAssistantReplyStream('Interrupt reply')
    })
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat),
      interruptionDecider: vi.fn(async () => ({
        decision: 'interrupt',
        reason: 'Understood — pausing the current reply and switching now.'
      }))
    } as never)

    const firstPromise = router.handleInboundEvent(
      createInboundEvent({
        eventId: 'evt-interrupt-1',
        channelId,
        messageId: 'msg-interrupt-1',
        content: 'draft a long reply'
      })
    )
    await expectEventually(() => {
      expect(streamChat).toHaveBeenCalledTimes(1)
    })

    const secondPromise = router.handleInboundEvent(
      createInboundEvent({
        eventId: 'evt-interrupt-2',
        channelId,
        messageId: 'msg-interrupt-2',
        content: 'stop and answer this instead'
      })
    )

    await expectEventually(() => {
      expect(firstAbortSignal?.aborted).toBe(true)
    })

    firstRun.finish('should never be sent')

    await Promise.all([firstPromise, secondPromise])

    expect(streamChat).toHaveBeenCalledTimes(2)
    expect(streamChat).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: [expect.objectContaining({ content: 'stop and answer this instead' })]
      })
    )
  })

  it('resumes the paused message instead of treating continue as a literal prompt', async () => {
    const firstRun = createDeferredAssistantReplyStream()
    let callIndex = 0
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async (params) => {
      callIndex += 1
      if (callIndex === 1) {
        firstRun.bindAbortSignal(params.abortSignal)
        return firstRun.stream
      }

      if (callIndex === 2) {
        return createAssistantReplyStream('Interrupt reply')
      }

      return createAssistantReplyStream('Resumed reply')
    })
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat),
      interruptionDecider: vi.fn(async () => ({
        decision: 'interrupt',
        reason: 'Understood — pausing the current reply and switching now.'
      }))
    } as never)

    const firstPromise = router.handleInboundEvent(
      createInboundEvent({
        eventId: 'evt-resume-1',
        channelId,
        messageId: 'msg-resume-1',
        content: 'draft the original answer'
      })
    )
    await expectEventually(() => {
      expect(streamChat).toHaveBeenCalledTimes(1)
    })

    const interruptPromise = router.handleInboundEvent(
      createInboundEvent({
        eventId: 'evt-resume-2',
        channelId,
        messageId: 'msg-resume-2',
        content: 'stop and answer this instead'
      })
    )

    firstRun.finish('stale reply')

    await Promise.all([firstPromise, interruptPromise])

    await router.handleInboundEvent(
      createInboundEvent({
        eventId: 'evt-resume-3',
        channelId,
        messageId: 'msg-resume-3',
        content: 'continue'
      })
    )

    expect(streamChat).toHaveBeenCalledTimes(3)
    expect(streamChat).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        messages: [expect.objectContaining({ content: 'draft the original answer' })]
      })
    )
  })

  it('does not publish a generic failure reply when an active run is intentionally interrupted', async () => {
    const firstRun = createDeferredAssistantReplyStream()
    let callIndex = 0
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async (params) => {
      callIndex += 1
      if (callIndex === 1) {
        firstRun.bindAbortSignal(params.abortSignal)
        return firstRun.stream
      }

      return createAssistantReplyStream('Interrupt reply')
    })
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat),
      interruptionDecider: vi.fn(async () => ({
        decision: 'interrupt',
        reason: 'Understood — pausing the current reply and switching now.'
      }))
    } as never)
    const publishedEvents: string[] = []

    eventBus.subscribe('channel.message.send-requested', (event) => {
      if (typeof event.content === 'string') {
        publishedEvents.push(event.content)
      }
    })

    const firstPromise = router.handleInboundEvent(
      createInboundEvent({
        eventId: 'evt-abort-1',
        channelId,
        messageId: 'msg-abort-1',
        content: 'work on the original task'
      })
    )
    await expectEventually(() => {
      expect(streamChat).toHaveBeenCalledTimes(1)
    })

    const secondPromise = router.handleInboundEvent(
      createInboundEvent({
        eventId: 'evt-abort-2',
        channelId,
        messageId: 'msg-abort-2',
        content: 'stop and switch right now'
      })
    )
    await expectEventually(() => {
      expect(streamChat).toHaveBeenCalledTimes(2)
    })

    firstRun.failWithErrorText('aborted')

    await Promise.all([firstPromise, secondPromise])

    expect(publishedEvents).not.toContain(
      '[Error] Failed to generate a response. Please check the provider configuration.'
    )
  })
  it('ignores inbound messages when the attached assistant is disabled', async () => {
    const disabledAssistant = await new AssistantsRepository(db).create({
      name: 'Disabled Assistant',
      providerId: (await new ProvidersRepository(db).list())[0]?.id ?? null,
      enabled: false
    })
    const disabledChannel = await channelsRepo.create({
      type: 'lark',
      name: 'Disabled Lark',
      assistantId: disabledAssistant.id,
      enabled: true,
      config: {
        appId: 'cli_disabled',
        appSecret: 'secret-disabled'
      }
    })
    const streamChat = vi.fn<AssistantRuntime['streamChat']>(async () => createStream())
    const router = new ChannelMessageRouter({
      eventBus,
      channelsRepo,
      bindingsRepo,
      threadsRepo,
      assistantRuntime: createAssistantRuntimeStub(streamChat)
    })

    await router.handleInboundEvent({
      eventId: 'evt-disabled',
      channelId: disabledChannel.id,
      channelType: 'lark',
      message: {
        id: 'msg-disabled',
        remoteChatId: 'oc_disabled',
        senderId: 'ou_user',
        content: 'hello',
        timestamp: new Date('2026-03-08T00:00:00.000Z')
      }
    })

    expect(streamChat).not.toHaveBeenCalled()
    await expect(
      bindingsRepo.getByChannelAndRemoteChat(disabledChannel.id, 'oc_disabled')
    ).resolves.toBeNull()
  })
})
