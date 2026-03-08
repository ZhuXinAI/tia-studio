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
    runCronJob: vi.fn(async () => ({ outputText: '' }))
  }
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
      providerId: provider.id
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

  it('publishes a send request after the assistant finishes', async () => {
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

    expect(publishedEvents).toContainEqual(
      expect.objectContaining({
        channelId,
        remoteChatId: 'oc_123',
        content: 'Hello from assistant'
      })
    )
  })

  it('does not publish a send request when the assistant text is empty', async () => {
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

    expect(publishedEvents).toEqual([])
  })
})
