import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { AssistantHeartbeatRunsRepository } from './assistant-heartbeat-runs-repo'
import { AssistantHeartbeatsRepository } from './assistant-heartbeats-repo'
import { ProvidersRepository } from './providers-repo'

describe('AssistantHeartbeatRunsRepository', () => {
  let db: AppDatabase
  let heartbeatsRepo: AssistantHeartbeatsRepository
  let runsRepo: AssistantHeartbeatRunsRepository
  let assistantId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    heartbeatsRepo = new AssistantHeartbeatsRepository(db)
    runsRepo = new AssistantHeartbeatRunsRepository(db)

    const providersRepo = new ProvidersRepository(db)
    const assistantsRepo = new AssistantsRepository(db)
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

    assistantId = assistant.id
  })

  afterEach(() => {
    db.close()
  })

  it('creates run records ordered newest first and cascades when the heartbeat is deleted', async () => {
    const heartbeat = await heartbeatsRepo.upsertForAssistant({
      assistantId,
      enabled: true,
      intervalMinutes: 30,
      prompt: 'Check recent work and follow up if needed.'
    })

    const olderRun = await runsRepo.create({
      heartbeatId: heartbeat.id,
      status: 'success',
      scheduledFor: '2026-03-10T00:30:00.000Z',
      startedAt: '2026-03-10T00:30:05.000Z',
      finishedAt: '2026-03-10T00:30:45.000Z',
      outputText: 'Checked recent work.',
      workLogPath: '/tmp/work-logs/2026-03-10-0030.md'
    })
    const newerRun = await runsRepo.create({
      heartbeatId: heartbeat.id,
      status: 'failed',
      scheduledFor: '2026-03-10T01:00:00.000Z',
      startedAt: '2026-03-10T01:00:03.000Z',
      finishedAt: '2026-03-10T01:00:15.000Z',
      error: {
        message: 'Workspace root missing'
      }
    })

    await expect(runsRepo.listByHeartbeatId(heartbeat.id)).resolves.toEqual([
      expect.objectContaining({
        id: newerRun.id,
        heartbeatId: heartbeat.id,
        status: 'failed',
        error: {
          message: 'Workspace root missing'
        }
      }),
      expect.objectContaining({
        id: olderRun.id,
        heartbeatId: heartbeat.id,
        status: 'success',
        outputText: 'Checked recent work.',
        workLogPath: '/tmp/work-logs/2026-03-10-0030.md'
      })
    ])

    await db.execute('DELETE FROM app_assistant_heartbeats WHERE id = ?', [heartbeat.id])

    await expect(runsRepo.listByHeartbeatId(heartbeat.id)).resolves.toEqual([])
  })
})
