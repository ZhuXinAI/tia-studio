import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { ProvidersRepository } from './providers-repo'
import { ThreadUsageRepository } from './thread-usage-repo'
import { ThreadsRepository } from './threads-repo'

describe('ThreadUsageRepository', () => {
  let db: AppDatabase
  let repo: ThreadUsageRepository
  let assistantId: string
  let providerId: string
  let threadId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new ThreadUsageRepository(db)

    const providersRepo = new ProvidersRepository(db)
    const assistantsRepo = new AssistantsRepository(db)
    const threadsRepo = new ThreadsRepository(db)

    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistant = await assistantsRepo.create({
      name: 'Usage Assistant',
      providerId: provider.id
    })
    const thread = await threadsRepo.create({
      assistantId: assistant.id,
      resourceId: 'profile-1',
      title: 'Usage thread'
    })

    providerId = provider.id
    assistantId = assistant.id
    threadId = thread.id
  })

  afterEach(() => {
    db.close()
  })

  it('records message usage rows and creates thread totals', async () => {
    await repo.recordMessageUsage({
      messageId: 'msg-1',
      threadId,
      assistantId,
      resourceId: 'profile-1',
      providerId,
      model: 'gpt-5',
      source: 'chat',
      usage: {
        inputTokens: 120,
        outputTokens: 40,
        totalTokens: 160,
        reasoningTokens: 12,
        cachedInputTokens: 30
      },
      stepCount: 2,
      finishReason: 'stop',
      createdAt: '2026-03-14T00:00:00.000Z'
    })

    await expect(repo.listByMessageIds(['msg-1', 'missing'])).resolves.toEqual({
      'msg-1': expect.objectContaining({
        messageId: 'msg-1',
        threadId,
        assistantId,
        resourceId: 'profile-1',
        providerId,
        model: 'gpt-5',
        inputTokens: 120,
        outputTokens: 40,
        totalTokens: 160,
        reasoningTokens: 12,
        cachedInputTokens: 30,
        stepCount: 2,
        finishReason: 'stop',
        source: 'chat',
        createdAt: '2026-03-14T00:00:00.000Z'
      })
    })

    await expect(repo.getThreadTotals(threadId)).resolves.toEqual({
      threadId,
      assistantMessageCount: 1,
      inputTokens: 120,
      outputTokens: 40,
      totalTokens: 160,
      reasoningTokens: 12,
      cachedInputTokens: 30
    })
  })

  it('re-records the same message id without double-counting thread totals', async () => {
    await repo.recordMessageUsage({
      messageId: 'msg-1',
      threadId,
      assistantId,
      resourceId: 'profile-1',
      providerId,
      model: 'gpt-5',
      source: 'chat',
      usage: {
        inputTokens: 120,
        outputTokens: 40,
        totalTokens: 160,
        reasoningTokens: 12,
        cachedInputTokens: 30
      },
      stepCount: 2,
      finishReason: 'stop',
      createdAt: '2026-03-14T00:00:00.000Z'
    })

    await repo.recordMessageUsage({
      messageId: 'msg-1',
      threadId,
      assistantId,
      resourceId: 'profile-1',
      providerId,
      model: 'gpt-5',
      source: 'chat',
      usage: {
        inputTokens: 150,
        outputTokens: 60,
        totalTokens: 210,
        reasoningTokens: 20,
        cachedInputTokens: 45
      },
      stepCount: 3,
      finishReason: 'length',
      createdAt: '2026-03-14T00:01:00.000Z'
    })

    await expect(repo.listByMessageIds(['msg-1'])).resolves.toEqual({
      'msg-1': expect.objectContaining({
        messageId: 'msg-1',
        inputTokens: 150,
        outputTokens: 60,
        totalTokens: 210,
        reasoningTokens: 20,
        cachedInputTokens: 45,
        stepCount: 3,
        finishReason: 'length',
        createdAt: '2026-03-14T00:01:00.000Z'
      })
    })

    await expect(repo.getThreadTotals(threadId)).resolves.toEqual({
      threadId,
      assistantMessageCount: 1,
      inputTokens: 150,
      outputTokens: 60,
      totalTokens: 210,
      reasoningTokens: 20,
      cachedInputTokens: 45
    })
  })

  it('returns null thread totals for empty threads', async () => {
    await expect(repo.getThreadTotals(threadId)).resolves.toBeNull()
  })
})
