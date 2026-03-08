import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { ChannelsRepository } from './channels-repo'
import { ProvidersRepository } from './providers-repo'

describe('ChannelsRepository', () => {
  let db: AppDatabase
  let repo: ChannelsRepository
  let assistantId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new ChannelsRepository(db)

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

    assistantId = assistant.id
  })

  afterEach(() => {
    db.close()
  })

  it('returns an empty default state when no channels exist', async () => {
    await expect(repo.list()).resolves.toEqual([])
    await expect(repo.listEnabled()).resolves.toEqual([])
    await expect(repo.getByType('lark')).resolves.toEqual([])
    await expect(repo.getById('missing-channel')).resolves.toBeNull()
  })

  it('creates and updates a lark channel record', async () => {
    const created = await repo.create({
      type: 'lark',
      name: 'Lark',
      assistantId,
      enabled: true,
      config: {
        appId: 'cli_xxx',
        appSecret: 'secret'
      }
    })

    expect(created).toMatchObject({
      type: 'lark',
      name: 'Lark',
      assistantId,
      enabled: true,
      config: {
        appId: 'cli_xxx',
        appSecret: 'secret'
      },
      lastError: null
    })

    const byType = await repo.getByType('lark')
    const enabledChannels = await repo.listEnabled()

    expect(byType).toHaveLength(1)
    expect(enabledChannels).toHaveLength(1)
    expect(enabledChannels[0]?.id).toBe(created.id)

    const updated = await repo.update(created.id, {
      name: 'Ops Lark',
      assistantId: null,
      enabled: false,
      config: {
        appId: 'cli_yyy',
        appSecret: 'secret-2',
        encryptKey: 'encrypt'
      },
      lastError: 'Bad credentials'
    })

    expect(updated).toMatchObject({
      id: created.id,
      type: 'lark',
      name: 'Ops Lark',
      assistantId: null,
      enabled: false,
      config: {
        appId: 'cli_yyy',
        appSecret: 'secret-2',
        encryptKey: 'encrypt'
      },
      lastError: 'Bad credentials'
    })
    await expect(repo.getById(created.id)).resolves.toMatchObject({
      id: created.id,
      enabled: false,
      lastError: 'Bad credentials'
    })
    await expect(repo.listEnabled()).resolves.toEqual([])
  })
})
