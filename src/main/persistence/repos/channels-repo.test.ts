import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { ChannelsRepository } from './channels-repo'
import { ProvidersRepository } from './providers-repo'

describe('ChannelsRepository', () => {
  let db: AppDatabase
  let repo: ChannelsRepository
  let assistantsRepo: AssistantsRepository
  let providerId: string
  let assistantId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new ChannelsRepository(db)

    const providersRepo = new ProvidersRepository(db)
    assistantsRepo = new AssistantsRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    providerId = provider.id
    const assistant = await assistantsRepo.create({
      name: 'Support Assistant',
      providerId: provider.id,
      enabled: true
    })

    assistantId = assistant.id
  })

  afterEach(() => {
    db.close()
  })

  it('returns an empty default state when no channels exist', async () => {
    await expect(repo.list()).resolves.toEqual([])
    await expect(repo.listEnabled()).resolves.toEqual([])
    await expect(repo.listRuntimeEnabled()).resolves.toEqual([])
    await expect(repo.listUnbound()).resolves.toEqual([])
    await expect(repo.getByType('lark')).resolves.toEqual([])
    await expect(repo.getById('missing-channel')).resolves.toBeNull()
  })

  it('supports multiple lark channels and runtime channel lookups', async () => {
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
    const unboundChannel = await repo.create({
      type: 'lark',
      name: 'Ops Lark',
      assistantId: null,
      enabled: true,
      config: {
        appId: 'cli_yyy',
        appSecret: 'secret-2'
      }
    })
    const disabledAssistant = await assistantsRepo.create({
      name: 'Disabled Assistant',
      providerId,
      enabled: false
    })
    const disabledAssistantChannel = await repo.create({
      type: 'lark',
      name: 'Disabled Lark',
      assistantId: disabledAssistant.id,
      enabled: true,
      config: {
        appId: 'cli_zzz',
        appSecret: 'secret-3'
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
    const unboundChannels = await repo.listUnbound()
    const assistantChannel = await repo.getByAssistantId(assistantId)
    const runtimeEnabledChannels = await repo.listRuntimeEnabled()

    expect(byType).toHaveLength(3)
    expect(enabledChannels).toHaveLength(3)
    expect(enabledChannels[0]?.id).toBe(created.id)
    expect(unboundChannels).toEqual([
      expect.objectContaining({
        id: unboundChannel.id
      })
    ])
    expect(assistantChannel).toMatchObject({
      id: created.id
    })
    expect(runtimeEnabledChannels).toEqual([
      expect.objectContaining({
        id: created.id
      })
    ])
    expect(runtimeEnabledChannels).not.toContainEqual(
      expect.objectContaining({
        id: disabledAssistantChannel.id
      })
    )

    const updated = await repo.update(created.id, {
      name: 'Support Lark',
      assistantId: null,
      enabled: false,
      config: {
        appId: 'cli_xxy',
        appSecret: 'secret-4',
        encryptKey: 'encrypt'
      },
      lastError: 'Bad credentials'
    })

    expect(updated).toMatchObject({
      id: created.id,
      type: 'lark',
      name: 'Support Lark',
      assistantId: null,
      enabled: false,
      config: {
        appId: 'cli_xxy',
        appSecret: 'secret-4',
        encryptKey: 'encrypt'
      },
      lastError: 'Bad credentials'
    })
    await expect(repo.getById(created.id)).resolves.toMatchObject({
      id: created.id,
      enabled: false,
      lastError: 'Bad credentials'
    })
    await expect(repo.listEnabled()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: unboundChannel.id,
          enabled: true
        }),
        expect.objectContaining({
          id: disabledAssistantChannel.id,
          enabled: true
        })
      ])
    )
  })
})
