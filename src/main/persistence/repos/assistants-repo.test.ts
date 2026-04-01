import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import {
  createAssistantSchema,
  updateAssistantSchema
} from '../../server/validators/assistants-validator'
import { AssistantsRepository } from './assistants-repo'
import { ProvidersRepository } from './providers-repo'

describe('AssistantsRepository', () => {
  let db: AppDatabase
  let repo: AssistantsRepository
  let providerId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new AssistantsRepository(db)

    const providersRepo = new ProvidersRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })

    providerId = provider.id
  })

  afterEach(() => {
    db.close()
  })

  it('creates, lists, reads, and updates assistant activation', async () => {
    const created = await repo.create({
      name: 'Ops Assistant',
      providerId,
      enabled: false
    })

    expect(created).toMatchObject({
      name: 'Ops Assistant',
      providerId,
      enabled: false
    })

    await expect(repo.list()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        enabled: false
      })
    ])

    await expect(repo.getById(created.id)).resolves.toMatchObject({
      id: created.id,
      enabled: false
    })

    const updated = await repo.update(created.id, {
      enabled: true
    })

    expect(updated).toMatchObject({
      id: created.id,
      enabled: true
    })
    await expect(repo.getById(created.id)).resolves.toMatchObject({
      id: created.id,
      enabled: true
    })
  })

  it('normalizes legacy workspace path configs to rootPath', async () => {
    const created = await repo.create({
      name: 'Legacy Workspace Assistant',
      providerId,
      workspaceConfig: {
        path: '/tmp/legacy-workspace'
      }
    })

    expect(created.workspaceConfig).toEqual({
      rootPath: '/tmp/legacy-workspace'
    })

    await expect(repo.getById(created.id)).resolves.toMatchObject({
      workspaceConfig: {
        rootPath: '/tmp/legacy-workspace'
      }
    })
  })

  it('round-trips assistant origin and studio feature flags', async () => {
    const created = await repo.create({
      name: 'ACP Assistant',
      providerId,
      origin: 'external-acp',
      studioFeaturesEnabled: false
    })

    expect(created).toMatchObject({
      origin: 'external-acp',
      studioFeaturesEnabled: false
    })

    await expect(repo.getById(created.id)).resolves.toMatchObject({
      id: created.id,
      origin: 'external-acp',
      studioFeaturesEnabled: false
    })

    const updated = await repo.update(created.id, {
      origin: 'tia',
      studioFeaturesEnabled: true
    })

    expect(updated).toMatchObject({
      id: created.id,
      origin: 'tia',
      studioFeaturesEnabled: true
    })
    await expect(repo.list()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        origin: 'tia',
        studioFeaturesEnabled: true
      })
    ])
  })

  it('validates the supported assistant origins', () => {
    for (const origin of ['tia', 'external-acp', 'built-in'] as const) {
      expect(
        createAssistantSchema.safeParse({
          name: 'Origin Test',
          providerId: 'provider-1',
          origin
        }).success
      ).toBe(true)
      expect(updateAssistantSchema.safeParse({ origin }).success).toBe(true)
    }

    expect(
      createAssistantSchema.safeParse({
        name: 'Origin Test',
        providerId: 'provider-1',
        origin: 'legacy'
      }).success
    ).toBe(false)
  })
})
