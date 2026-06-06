import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WhatsAppAuthStateStore } from '../../channels/whatsapp-auth-state-store'
import { WechatAuthStateStore } from '../../channels/wechat-auth-state-store'
import { BUILT_IN_DEFAULT_AGENT_MCP_KEY } from '../../default-agent/default-agent-bootstrap'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ChannelPairingsRepository } from '../../persistence/repos/channel-pairings-repo'
import { ChannelsRepository } from '../../persistence/repos/channels-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { registerChannelsRoute } from './channels-route'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-user-data')
  }
}))

describe('channels route', () => {
  let db: AppDatabase
  let app: Hono
  let providersRepo: ProvidersRepository
  let assistantsRepo: AssistantsRepository
  let channelsRepo: ChannelsRepository
  let pairingsRepo: ChannelPairingsRepository
  let whatsAppAuthStateStore: WhatsAppAuthStateStore
  let wechatAuthStateStore: WechatAuthStateStore
  let channelReloadMock: ReturnType<typeof vi.fn<() => Promise<void>>>
  let recoverChannelMock: ReturnType<
    typeof vi.fn<(channel: { id: string; type: string }) => Promise<void>>
  >
  let providerId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    providersRepo = new ProvidersRepository(db)
    assistantsRepo = new AssistantsRepository(db)
    channelsRepo = new ChannelsRepository(db)
    pairingsRepo = new ChannelPairingsRepository(db)
    whatsAppAuthStateStore = new WhatsAppAuthStateStore({
      now: () => new Date('2026-03-10T00:00:00.000Z')
    })
    wechatAuthStateStore = new WechatAuthStateStore({
      now: () => new Date('2026-03-10T00:00:00.000Z')
    })
    channelReloadMock = vi.fn(async () => undefined)
    recoverChannelMock = vi.fn(async () => undefined)
    app = new Hono()

    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    providerId = provider.id

    registerChannelsRoute(app, {
      assistantsRepo,
      channelsRepo,
      pairingsRepo,
      whatsAppAuthStateStore,
      wechatAuthStateStore,
      channelService: {
        reload: channelReloadMock
      },
      channelSetupRecovery: {
        recover: recoverChannelMock
      }
    })
  })

  afterEach(() => {
    db.close()
  })

  it('lists configured channels while hiding those attached to built-in assistants', async () => {
    const builtInAssistant = await assistantsRepo.create({
      name: 'Default Agent',
      providerId,
      enabled: true,
      mcpConfig: {
        [BUILT_IN_DEFAULT_AGENT_MCP_KEY]: true
      }
    })
    const visibleAssistant = await assistantsRepo.create({
      name: 'Ops Assistant',
      providerId,
      enabled: true
    })
    const boundChannel = await channelsRepo.create({
      type: 'lark',
      name: 'Bound Lark',
      assistantId: visibleAssistant.id,
      enabled: true,
      config: {
        appId: 'cli_bound',
        appSecret: 'secret-bound'
      }
    })
    await channelsRepo.create({
      type: 'lark',
      name: 'Built In Lark',
      assistantId: builtInAssistant.id,
      enabled: true,
      config: {
        appId: 'cli_builtin',
        appSecret: 'secret-builtin'
      }
    })

    const response = await app.request('http://localhost/v1/channels')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: boundChannel.id,
        type: 'lark',
        name: 'Bound Lark',
        assistantId: visibleAssistant.id,
        assistantName: 'Ops Assistant',
        status: 'connected'
      })
    ])
  })

  it('creates, updates, and deletes configured channels through the live route', async () => {
    const createResponse = await app.request('http://localhost/v1/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'telegram',
        name: 'Alias Telegram',
        botToken: '123456:alias-token'
      })
    })

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created).toMatchObject({
      type: 'telegram',
      name: 'Alias Telegram',
      assistantId: null,
      assistantName: null
    })

    const updateResponse = await app.request(`http://localhost/v1/channels/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'telegram',
        name: 'Alias Telegram Updated',
        botToken: '123456:alias-token-updated'
      })
    })

    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: created.id,
      name: 'Alias Telegram Updated'
    })

    const deleteResponse = await app.request(`http://localhost/v1/channels/${created.id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(204)
    await expect(channelsRepo.getById(created.id)).resolves.toBeNull()
  })

  it('reloads services when updating a configured channel attached to a visible assistant', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Ops Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'telegram',
      name: 'Ops Telegram',
      assistantId: assistant.id,
      enabled: true,
      config: {
        botToken: '123456:original-token'
      }
    })

    const response = await app.request(`http://localhost/v1/channels/${channel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'telegram',
        name: 'Ops Telegram Updated',
        botToken: '123456:updated-token'
      })
    })

    expect(response.status).toBe(200)
    expect(channelReloadMock).toHaveBeenCalledOnce()
    await expect(channelsRepo.getById(channel.id)).resolves.toMatchObject({
      id: channel.id,
      name: 'Ops Telegram Updated',
      config: {
        botToken: '123456:updated-token'
      }
    })
  })

  it('recovers a configured channel and clears its last error', async () => {
    const channel = await channelsRepo.create({
      type: 'whatsapp',
      name: 'Ops WhatsApp',
      assistantId: null,
      enabled: true,
      lastError: 'Bad auth',
      config: {
        groupRequireMention: true
      }
    })

    const response = await app.request(`http://localhost/v1/channels/${channel.id}/recover`, {
      method: 'POST'
    })

    expect(response.status).toBe(200)
    expect(recoverChannelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: channel.id,
        type: 'whatsapp'
      })
    )
    expect(channelReloadMock).toHaveBeenCalledOnce()
    await expect(channelsRepo.getById(channel.id)).resolves.toMatchObject({
      id: channel.id,
      lastError: null
    })
    await expect(response.json()).resolves.toMatchObject({
      id: channel.id,
      status: 'disconnected',
      errorMessage: null
    })
  })

  it('rejects deleting a channel that is attached to an assistant', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Ops Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'lark',
      name: 'Ops Lark',
      assistantId: assistant.id,
      enabled: true,
      config: {
        appId: 'cli_ops',
        appSecret: 'secret-ops'
      }
    })

    const response = await app.request(`http://localhost/v1/channels/${channel.id}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Channel is attached to an assistant'
    })
  })
})
