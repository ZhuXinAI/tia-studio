import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ChannelsRepository } from '../../persistence/repos/channels-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { registerChannelsSettingsRoute } from './channels-settings-route'

describe('channels settings route', () => {
  let db: AppDatabase
  let app: Hono
  let channelsRepo: ChannelsRepository
  let reloadMock: ReturnType<typeof vi.fn>
  let assistantId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    channelsRepo = new ChannelsRepository(db)
    reloadMock = vi.fn(async () => undefined)
    app = new Hono()

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

    registerChannelsSettingsRoute(app, {
      channelsRepo,
      channelService: {
        reload: reloadMock
      } as never
    })
  })

  afterEach(() => {
    db.close()
  })

  it('loads saved channel settings', async () => {
    const response = await app.request('http://localhost/v1/settings/channels')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      lark: {
        id: null,
        enabled: false,
        name: 'Lark',
        assistantId: null,
        appId: '',
        appSecret: '',
        status: 'disconnected',
        errorMessage: null
      }
    })
  })

  it('upserts the lark settings record and reloads channels', async () => {
    const response = await app.request('http://localhost/v1/settings/channels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lark: {
          enabled: true,
          name: 'Lark',
          assistantId,
          appId: 'cli_xxx',
          appSecret: 'secret'
        }
      })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      lark: {
        id: expect.any(String),
        enabled: true,
        name: 'Lark',
        assistantId,
        appId: 'cli_xxx',
        appSecret: 'secret',
        status: 'connected',
        errorMessage: null
      }
    })
    await expect(channelsRepo.getByType('lark')).resolves.toEqual([
      expect.objectContaining({
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
    ])
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('validates required assistant and credential fields', async () => {
    const response = await app.request('http://localhost/v1/settings/channels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lark: {
          enabled: true,
          name: 'Lark',
          assistantId: '',
          appId: '',
          appSecret: ''
        }
      })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Lark assistant is required'
    })
    expect(reloadMock).not.toHaveBeenCalled()
  })
})
