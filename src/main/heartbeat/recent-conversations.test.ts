import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mastra } from '@mastra/core/mastra'
import type { AppDatabase } from '../persistence/client'
import { migrateAppSchema } from '../persistence/migrate'
import { AssistantsRepository } from '../persistence/repos/assistants-repo'
import { ChannelThreadBindingsRepository } from '../persistence/repos/channel-thread-bindings-repo'
import { ChannelsRepository } from '../persistence/repos/channels-repo'
import { ProvidersRepository } from '../persistence/repos/providers-repo'
import { ThreadsRepository } from '../persistence/repos/threads-repo'
import { listRecentConversations } from './recent-conversations'

describe('recent conversations', () => {
  let db: AppDatabase
  let assistantsRepo: AssistantsRepository
  let providersRepo: ProvidersRepository
  let channelsRepo: ChannelsRepository
  let threadsRepo: ThreadsRepository
  let bindingsRepo: ChannelThreadBindingsRepository
  let assistantId: string
  let otherAssistantId: string
  let channelId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    assistantsRepo = new AssistantsRepository(db)
    providersRepo = new ProvidersRepository(db)
    channelsRepo = new ChannelsRepository(db)
    threadsRepo = new ThreadsRepository(db)
    bindingsRepo = new ChannelThreadBindingsRepository(db)

    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistant = await assistantsRepo.create({
      name: 'Heartbeat Assistant',
      providerId: provider.id
    })
    const otherAssistant = await assistantsRepo.create({
      name: 'Other Assistant',
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
    otherAssistantId = otherAssistant.id
    channelId = channel.id
  })

  afterEach(() => {
    db.close()
  })

  it('returns only assistant-owned reachable channel conversations with recent user activity', async () => {
    const channelThread = await threadsRepo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'Channel conversation'
    })
    const hiddenHeartbeatThread = await threadsRepo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'Heartbeat',
      metadata: {
        system: true,
        systemType: 'heartbeat'
      }
    })
    const appOnlyThread = await threadsRepo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'App only'
    })
    const otherAssistantThread = await threadsRepo.create({
      assistantId: otherAssistantId,
      resourceId: 'profile-default',
      title: 'Other assistant channel thread'
    })

    await bindingsRepo.create({
      channelId,
      remoteChatId: 'chat-1',
      threadId: channelThread.id
    })
    await bindingsRepo.create({
      channelId,
      remoteChatId: 'chat-hidden',
      threadId: hiddenHeartbeatThread.id
    })
    await bindingsRepo.create({
      channelId,
      remoteChatId: 'chat-other',
      threadId: otherAssistantThread.id
    })

    const listMessages = vi.fn(async ({ threadId }: { threadId: string }) => {
      if (threadId === channelThread.id) {
        return {
          messages: [
            {
              id: 'assistant-message-1',
              role: 'assistant',
              createdAt: '2026-03-10T00:15:00.000Z'
            },
            {
              id: 'user-message-1',
              role: 'user',
              createdAt: '2026-03-10T00:20:00.000Z'
            }
          ]
        }
      }

      if (threadId === hiddenHeartbeatThread.id) {
        return {
          messages: [
            {
              id: 'user-message-hidden',
              role: 'user',
              createdAt: '2026-03-10T00:25:00.000Z'
            }
          ]
        }
      }

      if (threadId === otherAssistantThread.id) {
        return {
          messages: [
            {
              id: 'user-message-other',
              role: 'user',
              createdAt: '2026-03-10T00:10:00.000Z'
            }
          ]
        }
      }

      if (threadId === appOnlyThread.id) {
        return {
          messages: [
            {
              id: 'user-message-app-only',
              role: 'user',
              createdAt: '2026-03-10T00:05:00.000Z'
            }
          ]
        }
      }

      return { messages: [] }
    })

    const mastra = {
      getStorage: () => ({
        getStore: async () => ({
          listMessages
        })
      })
    } as unknown as Mastra

    const conversations = await listRecentConversations({
      assistantId,
      threadsRepo,
      channelThreadBindingsRepo: bindingsRepo,
      mastra,
      now: new Date('2026-03-10T00:30:00.000Z')
    })

    expect(conversations).toEqual([
      {
        threadId: channelThread.id,
        channelId,
        remoteChatId: 'chat-1',
        lastUserMessageAt: '2026-03-10T00:20:00.000Z',
        minutesSinceActivity: 10
      }
    ])
  })
})
