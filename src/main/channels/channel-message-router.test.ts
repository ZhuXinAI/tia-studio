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
