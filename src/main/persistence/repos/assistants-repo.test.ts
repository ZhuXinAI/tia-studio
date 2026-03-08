import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
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
})
