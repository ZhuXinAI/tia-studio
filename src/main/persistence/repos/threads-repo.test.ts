import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { ProvidersRepository } from './providers-repo'
import { ThreadsRepository } from './threads-repo'

describe('ThreadsRepository', () => {
  let db: AppDatabase
  let repo: ThreadsRepository
  let assistantId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new ThreadsRepository(db)

    const providersRepo = new ProvidersRepository(db)
    const assistantsRepo = new AssistantsRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistant = await assistantsRepo.create({
      name: 'Threads Assistant',
      providerId: provider.id
    })

    assistantId = assistant.id
  })

  afterEach(() => {
    db.close()
  })

  it('filters heartbeat and cron system threads by default and includes them on demand', async () => {
    const visibleThread = await repo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'Visible chat'
    })
    const hiddenCronThread = await repo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'Daily cron',
      metadata: {
        system: true,
        systemType: 'cron',
        cronJobId: 'cron-job-1'
      }
    })
    const hiddenHeartbeatThread = await repo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'Heartbeat',
      metadata: {
        system: true,
        systemType: 'heartbeat',
        heartbeatId: 'heartbeat-1'
      }
    })

    await expect(repo.listByAssistant(assistantId)).resolves.toEqual([
      expect.objectContaining({
        id: visibleThread.id,
        title: 'Visible chat'
      })
    ])

    await expect(repo.listByAssistant(assistantId, { includeHidden: true })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: visibleThread.id
        }),
        expect.objectContaining({
          id: hiddenCronThread.id,
          metadata: {
            system: true,
            systemType: 'cron',
            cronJobId: 'cron-job-1'
          }
        }),
        expect.objectContaining({
          id: hiddenHeartbeatThread.id,
          metadata: {
            system: true,
            systemType: 'heartbeat',
            heartbeatId: 'heartbeat-1'
          }
        })
      ])
    )
  })

  it('finds cron-owned hidden threads by cron job id for both system and legacy metadata', async () => {
    const legacyCronThread = await repo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'Legacy cron',
      metadata: {
        cron: true,
        cronJobId: 'cron-job-legacy'
      }
    })
    const systemCronThread = await repo.create({
      assistantId,
      resourceId: 'profile-default',
      title: 'System cron',
      metadata: {
        system: true,
        systemType: 'cron',
        cronJobId: 'cron-job-system'
      }
    })

    await expect(repo.findHiddenByCronJobId('cron-job-legacy')).resolves.toMatchObject({
      id: legacyCronThread.id
    })
    await expect(repo.findHiddenByCronJobId('cron-job-system')).resolves.toMatchObject({
      id: systemCronThread.id
    })
  })
})
