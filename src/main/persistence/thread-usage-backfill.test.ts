import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from './client'
import { createAppDatabase } from './client'
import { createMastraInstance } from '../mastra/store'
import { migrateAppSchema } from './migrate'
import { AssistantsRepository } from './repos/assistants-repo'
import { ProvidersRepository } from './repos/providers-repo'
import { ThreadUsageRepository } from './repos/thread-usage-repo'
import { ThreadsRepository } from './repos/threads-repo'
import { runThreadUsageBackfill } from './thread-usage-backfill'

const tempPaths: string[] = []

afterEach(() => {
  tempPaths.splice(0).forEach((tempPath) => {
    void rm(tempPath, {
      recursive: true,
      force: true,
      maxRetries: 50,
      retryDelay: 200
    }).catch(() => undefined)
  })
})

describe('runThreadUsageBackfill', () => {
  it('backfills legacy metadata usage into normalized usage tables once', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-thread-usage-backfill-'))
    tempPaths.push(tempDir)

    const appDbPath = path.join(tempDir, 'tia-studio.db')
    const mastraDbPath = path.join(tempDir, 'mastra.db')

    const appDb = await migrateAppSchema(appDbPath)
    const providersRepo = new ProvidersRepository(appDb)
    const assistantsRepo = new AssistantsRepository(appDb)
    const threadsRepo = new ThreadsRepository(appDb)
    const usageRepo = new ThreadUsageRepository(appDb)

    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistant = await assistantsRepo.create({
      name: 'Backfill Assistant',
      providerId: provider.id
    })
    const thread = await threadsRepo.create({
      assistantId: assistant.id,
      resourceId: 'profile-1',
      title: 'Backfill thread'
    })

    const mastra = await createMastraInstance(mastraDbPath)
    const storage = mastra.getStorage()
    await storage?.getStore('memory')

    const mastraDb: AppDatabase = createAppDatabase(mastraDbPath)
    await mastraDb.execute(
      `
        INSERT INTO mastra_messages (id, thread_id, content, role, type, "createdAt", "resourceId")
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        'msg-1',
        thread.id,
        JSON.stringify({
          parts: [{ type: 'text', text: 'Final answer' }],
          metadata: {
            usage: {
              inputTokens: 100,
              outputTokens: 25,
              totalTokens: 125
            }
          }
        }),
        'assistant',
        'v2',
        '2026-03-14T00:00:00.000Z',
        thread.resourceId
      ]
    )

    await runThreadUsageBackfill({
      appDb,
      mastraDbPath,
      usageRepo
    })

    await expect(usageRepo.listByMessageIds(['msg-1'])).resolves.toEqual({
      'msg-1': expect.objectContaining({
        messageId: 'msg-1',
        threadId: thread.id,
        assistantId: assistant.id,
        providerId: provider.id,
        model: 'gpt-5',
        inputTokens: 100,
        outputTokens: 25,
        totalTokens: 125,
        source: 'backfill'
      })
    })

    await expect(usageRepo.getThreadTotals(thread.id)).resolves.toEqual({
      threadId: thread.id,
      assistantMessageCount: 1,
      inputTokens: 100,
      outputTokens: 25,
      totalTokens: 125,
      reasoningTokens: 0,
      cachedInputTokens: 0
    })

    await runThreadUsageBackfill({
      appDb,
      mastraDbPath,
      usageRepo
    })

    const usageRowCountResult = await appDb.execute(
      'SELECT COUNT(*) AS total FROM app_thread_message_usage WHERE message_id = ?',
      ['msg-1']
    )
    expect(Number((usageRowCountResult.rows[0] as Record<string, unknown>).total)).toBe(1)

    const preferenceResult = await appDb.execute(
      'SELECT value FROM app_preferences WHERE key = ? LIMIT 1',
      ['thread_usage_backfill_v1']
    )
    expect(preferenceResult.rows.at(0)).toMatchObject({
      value: 'true'
    })

    await mastraDb.close()
    await appDb.close()
  })
})
