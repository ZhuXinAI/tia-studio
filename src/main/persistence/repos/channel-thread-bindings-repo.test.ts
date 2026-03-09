import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { ChannelThreadBindingsRepository } from './channel-thread-bindings-repo'
import { ChannelsRepository } from './channels-repo'
import { ProvidersRepository } from './providers-repo'
import { ThreadsRepository } from './threads-repo'

describe('ChannelThreadBindingsRepository', () => {
  let db: AppDatabase
  let repo: ChannelThreadBindingsRepository
  let channelId: string
  let threadId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new ChannelThreadBindingsRepository(db)

    const providersRepo = new ProvidersRepository(db)
    const assistantsRepo = new AssistantsRepository(db)
    const channelsRepo = new ChannelsRepository(db)
    const threadsRepo = new ThreadsRepository(db)
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
    const thread = await threadsRepo.create({
      assistantId: assistant.id,
      resourceId: 'default-profile',
      title: 'Channel thread'
    })

    channelId = channel.id
    threadId = thread.id
  })

  afterEach(() => {
    db.close()
  })

  it('returns null when a remote chat binding does not exist', async () => {
    await expect(repo.getByChannelAndRemoteChat(channelId, 'oc_missing')).resolves.toBeNull()
  })

  it('creates and reuses a remote chat to local thread binding', async () => {
    const binding = await repo.create({
      channelId,
      remoteChatId: 'oc_123',
      threadId
    })

    expect(binding).toMatchObject({
      channelId,
      remoteChatId: 'oc_123',
      threadId
    })

    const found = await repo.getByChannelAndRemoteChat(channelId, 'oc_123')

    expect(found).toMatchObject({
      channelId,
      remoteChatId: 'oc_123',
      threadId
    })
  })

  it('lists bindings by thread ids', async () => {
    await repo.create({
      channelId,
      remoteChatId: 'oc_123',
      threadId
    })

    await expect(repo.listByThreadIds([threadId, 'missing-thread'])).resolves.toEqual([
      expect.objectContaining({
        channelId,
        remoteChatId: 'oc_123',
        threadId
      })
    ])
  })
})
