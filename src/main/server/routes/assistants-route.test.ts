import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { registerAssistantsRoute } from './assistants-route'

describe('assistants route', () => {
  let db: AppDatabase
  let app: Hono
  let providersRepo: ProvidersRepository
  let assistantsRepo: AssistantsRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    providersRepo = new ProvidersRepository(db)
    assistantsRepo = new AssistantsRepository(db)
    app = new Hono()
    registerAssistantsRoute(app, { assistantsRepo })
  })

  afterEach(() => {
    db.close()
  })

  it('lists assistants for workspace plumbing', async () => {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistant = await assistantsRepo.create({
      name: 'Trip Planner',
      description: 'Plans travel itineraries and bookings.',
      providerId: provider.id,
      enabled: true,
      workspaceConfig: { rootPath: '/tmp/workspace' }
    })

    const response = await app.request('http://localhost/v1/assistants')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: assistant.id,
        name: 'Trip Planner',
        providerId: provider.id,
        enabled: true
      })
    ])
  })
})
