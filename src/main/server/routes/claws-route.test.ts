import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WhatsAppAuthStateStore } from '../../channels/whatsapp-auth-state-store'
import { BUILT_IN_DEFAULT_AGENT_MCP_KEY } from '../../default-agent/default-agent-bootstrap'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ChannelPairingsRepository } from '../../persistence/repos/channel-pairings-repo'
import { ChannelsRepository } from '../../persistence/repos/channels-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { registerClawsRoute } from './claws-route'

describe('claws route', () => {
  let db: AppDatabase
  let app: Hono
  let providersRepo: ProvidersRepository
  let assistantsRepo: AssistantsRepository
  let channelsRepo: ChannelsRepository
  let pairingsRepo: ChannelPairingsRepository
  let whatsAppAuthStateStore: WhatsAppAuthStateStore
  let channelReloadMock: ReturnType<typeof vi.fn<() => Promise<void>>>
  let cronReloadMock: ReturnType<typeof vi.fn<() => Promise<void>>>
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
    channelReloadMock = vi.fn(async () => undefined)
    cronReloadMock = vi.fn(async () => undefined)
    app = new Hono()

    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    providerId = provider.id

    registerClawsRoute(app, {
      assistantsRepo,
      providersRepo,
      channelsRepo,
      pairingsRepo,
      whatsAppAuthStateStore,
      channelService: {
        reload: channelReloadMock
      },
      cronSchedulerService: {
        reload: cronReloadMock
      }
    })
  })

  afterEach(() => {
    db.close()
  })

  it('lists non-built-in claws and configured channels with binding metadata', async () => {
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
    const unboundChannel = await channelsRepo.create({
      type: 'lark',
      name: 'Extra Lark',
      assistantId: null,
      enabled: true,
      config: {
        appId: 'cli_extra',
        appSecret: 'secret-extra'
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

    const response = await app.request('http://localhost/v1/claws')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      claws: [
        expect.objectContaining({
          id: visibleAssistant.id,
          name: 'Ops Assistant',
          enabled: true,
          channel: expect.objectContaining({
            name: 'Bound Lark',
            status: 'connected'
          })
        })
      ],
      configuredChannels: [
        expect.objectContaining({
          id: boundChannel.id,
          type: 'lark',
          name: 'Bound Lark',
          assistantId: visibleAssistant.id,
          assistantName: 'Ops Assistant',
          status: 'connected',
          errorMessage: null,
          pairedCount: 0,
          pendingPairingCount: 0
        }),
        expect.objectContaining({
          id: unboundChannel.id,
          type: 'lark',
          name: 'Extra Lark',
          assistantId: null,
          assistantName: null,
          status: 'disconnected',
          errorMessage: null,
          pairedCount: 0,
          pendingPairingCount: 0
        })
      ]
    })
  })

  it('creates a claw with a new inline lark channel and reloads runtime', async () => {
    const response = await app.request('http://localhost/v1/claws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistant: {
          name: 'Ops Assistant',
          providerId,
          instructions: 'Handle ops requests.',
          enabled: true
        },
        channel: {
          mode: 'create',
          type: 'lark',
          name: 'Ops Lark',
          appId: 'cli_ops',
          appSecret: 'secret-ops'
        }
      })
    })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({
      name: 'Ops Assistant',
      enabled: true,
      channel: {
        name: 'Ops Lark'
      }
    })
    expect(channelReloadMock).toHaveBeenCalledOnce()
    expect(cronReloadMock).toHaveBeenCalledOnce()
  })

  it('creates a claw with a new inline telegram channel', async () => {
    const response = await app.request('http://localhost/v1/claws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistant: {
          name: 'Telegram Assistant',
          providerId,
          enabled: true
        },
        channel: {
          mode: 'create',
          type: 'telegram',
          name: 'Telegram Bot',
          botToken: '123456:test-token'
        }
      })
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      name: 'Telegram Assistant',
      channel: {
        type: 'telegram',
        name: 'Telegram Bot',
        pairedCount: 0,
        pendingPairingCount: 0
      }
    })
  })

  it('creates an unbound configured channel', async () => {
    const response = await app.request('http://localhost/v1/claws/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'lark',
        name: 'Configured Lark',
        appId: 'cli_configured',
        appSecret: 'secret-configured'
      })
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      type: 'lark',
      name: 'Configured Lark',
      assistantId: null,
      assistantName: null,
      status: 'disconnected',
      errorMessage: null
    })
    expect(channelReloadMock).not.toHaveBeenCalled()
    expect(cronReloadMock).not.toHaveBeenCalled()
  })

  it('creates an unbound configured whatsapp channel', async () => {
    const response = await app.request('http://localhost/v1/claws/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'whatsapp',
        name: 'Configured WhatsApp'
      })
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      type: 'whatsapp',
      name: 'Configured WhatsApp',
      assistantId: null,
      assistantName: null,
      status: 'disconnected',
      errorMessage: null
    })
  })

  it('updates an existing configured channel', async () => {
    const channel = await channelsRepo.create({
      type: 'lark',
      name: 'Configured Lark',
      assistantId: null,
      enabled: true,
      config: {
        appId: 'cli_configured',
        appSecret: 'secret-configured'
      }
    })

    const response = await app.request(`http://localhost/v1/claws/channels/${channel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'lark',
        name: 'Updated Lark',
        appId: 'cli_updated',
        appSecret: 'secret-updated'
      })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: channel.id,
      type: 'lark',
      name: 'Updated Lark',
      assistantId: null,
      assistantName: null,
      status: 'disconnected',
      errorMessage: null
    })
    await expect(channelsRepo.getById(channel.id)).resolves.toMatchObject({
      id: channel.id,
      name: 'Updated Lark',
      config: {
        appId: 'cli_updated',
        appSecret: 'secret-updated'
      }
    })
    expect(channelReloadMock).not.toHaveBeenCalled()
    expect(cronReloadMock).not.toHaveBeenCalled()
  })

  it('reloads services when updating a configured channel attached to a claw', async () => {
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

    const response = await app.request(`http://localhost/v1/claws/channels/${channel.id}`, {
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
    expect(cronReloadMock).toHaveBeenCalledOnce()
    await expect(channelsRepo.getById(channel.id)).resolves.toMatchObject({
      id: channel.id,
      name: 'Ops Telegram Updated',
      config: {
        botToken: '123456:updated-token'
      }
    })
  })

  it('creates a claw without a channel as disabled even when enabled is requested', async () => {
    const response = await app.request('http://localhost/v1/claws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistant: {
          name: 'Unconfigured Assistant',
          providerId,
          enabled: true
        }
      })
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      name: 'Unconfigured Assistant',
      enabled: false,
      channel: null
    })
  })

  it('swaps a claw to another unbound channel and reloads runtime', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Ops Assistant',
      providerId,
      enabled: true
    })
    const currentChannel = await channelsRepo.create({
      type: 'lark',
      name: 'Current Lark',
      assistantId: assistant.id,
      enabled: true,
      config: {
        appId: 'cli_current',
        appSecret: 'secret-current'
      }
    })
    const nextChannel = await channelsRepo.create({
      type: 'lark',
      name: 'Next Lark',
      assistantId: null,
      enabled: true,
      config: {
        appId: 'cli_next',
        appSecret: 'secret-next'
      }
    })

    const response = await app.request(`http://localhost/v1/claws/${assistant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: {
          mode: 'attach',
          channelId: nextChannel.id
        }
      })
    })

    expect(response.status).toBe(200)
    await expect(channelsRepo.getById(currentChannel.id)).resolves.toMatchObject({
      id: currentChannel.id,
      assistantId: null
    })
    await expect(channelsRepo.getById(nextChannel.id)).resolves.toMatchObject({
      id: nextChannel.id,
      assistantId: assistant.id
    })
    expect(channelReloadMock).toHaveBeenCalledOnce()
    expect(cronReloadMock).toHaveBeenCalledOnce()
  })

  it('rejects attaching a channel already bound to another assistant', async () => {
    const firstAssistant = await assistantsRepo.create({
      name: 'First Assistant',
      providerId,
      enabled: true
    })
    const secondAssistant = await assistantsRepo.create({
      name: 'Second Assistant',
      providerId,
      enabled: true
    })
    const claimedChannel = await channelsRepo.create({
      type: 'lark',
      name: 'Claimed Lark',
      assistantId: firstAssistant.id,
      enabled: true,
      config: {
        appId: 'cli_claimed',
        appSecret: 'secret-claimed'
      }
    })

    const response = await app.request(`http://localhost/v1/claws/${secondAssistant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: {
          mode: 'attach',
          channelId: claimedChannel.id
        }
      })
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Channel is already attached to another assistant'
    })
    expect(channelReloadMock).not.toHaveBeenCalled()
    expect(cronReloadMock).not.toHaveBeenCalled()
  })

  it('deletes a claw and leaves its channel reusable', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Ops Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'lark',
      name: 'Reusable Lark',
      assistantId: assistant.id,
      enabled: true,
      config: {
        appId: 'cli_reusable',
        appSecret: 'secret-reusable'
      }
    })

    const response = await app.request(`http://localhost/v1/claws/${assistant.id}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(204)
    await expect(assistantsRepo.getById(assistant.id)).resolves.toBeNull()
    await expect(channelsRepo.getById(channel.id)).resolves.toMatchObject({
      id: channel.id,
      assistantId: null
    })
    expect(channelReloadMock).toHaveBeenCalledOnce()
    expect(cronReloadMock).toHaveBeenCalledOnce()
  })

  it('deletes an unbound configured channel', async () => {
    const channel = await channelsRepo.create({
      type: 'telegram',
      name: 'Disposable Telegram',
      assistantId: null,
      enabled: true,
      config: {
        botToken: '123456:test-disposable'
      }
    })

    const response = await app.request(`http://localhost/v1/claws/channels/${channel.id}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(204)
    await expect(channelsRepo.getById(channel.id)).resolves.toBeNull()
    expect(channelReloadMock).not.toHaveBeenCalled()
    expect(cronReloadMock).not.toHaveBeenCalled()
  })

  it('rejects deleting a configured channel that is still bound', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Ops Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'lark',
      name: 'Claimed Lark',
      assistantId: assistant.id,
      enabled: true,
      config: {
        appId: 'cli_claimed_delete',
        appSecret: 'secret-claimed-delete'
      }
    })

    const response = await app.request(`http://localhost/v1/claws/channels/${channel.id}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Channel is attached to an assistant'
    })
  })

  it('returns telegram pairing counts in the claw list', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Telegram Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'telegram',
      name: 'Telegram Bot',
      assistantId: assistant.id,
      enabled: true,
      config: {
        botToken: '123456:test-token'
      }
    })
    const approved = await pairingsRepo.createOrRefreshPending({
      channelId: channel.id,
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      expiresAt: '2099-03-09T01:00:00.000Z',
      lastSeenAt: '2026-03-09T00:00:00.000Z'
    })
    await pairingsRepo.approve(approved.id, '2026-03-09T00:05:00.000Z')
    await pairingsRepo.createOrRefreshPending({
      channelId: channel.id,
      remoteChatId: '1002',
      senderId: '1002',
      senderDisplayName: 'Bob',
      senderUsername: 'bob',
      code: 'CD8LM9NP',
      expiresAt: '2099-03-09T02:00:00.000Z',
      lastSeenAt: '2026-03-09T00:10:00.000Z'
    })

    const response = await app.request('http://localhost/v1/claws')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      claws: [
        expect.objectContaining({
          id: assistant.id,
          channel: expect.objectContaining({
            id: channel.id,
            pairedCount: 1,
            pendingPairingCount: 1
          })
        })
      ],
      configuredChannels: [
        expect.objectContaining({
          id: channel.id,
          type: 'telegram',
          name: 'Telegram Bot',
          assistantId: assistant.id,
          assistantName: 'Telegram Assistant',
          pairedCount: 1,
          pendingPairingCount: 1
        })
      ]
    })
  })

  it('lists telegram pairings for a claw', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Telegram Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'telegram',
      name: 'Telegram Bot',
      assistantId: assistant.id,
      enabled: true,
      config: {
        botToken: '123456:test-token'
      }
    })
    const approved = await pairingsRepo.createOrRefreshPending({
      channelId: channel.id,
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      expiresAt: '2099-03-09T01:00:00.000Z',
      lastSeenAt: '2026-03-09T00:00:00.000Z'
    })
    await pairingsRepo.approve(approved.id, '2026-03-09T00:05:00.000Z')
    await pairingsRepo.createOrRefreshPending({
      channelId: channel.id,
      remoteChatId: '1002',
      senderId: '1002',
      senderDisplayName: 'Bob',
      senderUsername: 'bob',
      code: 'CD8LM9NP',
      expiresAt: '2099-03-09T02:00:00.000Z',
      lastSeenAt: '2026-03-09T00:10:00.000Z'
    })

    const response = await app.request(`http://localhost/v1/claws/${assistant.id}/pairings`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pairings: [
        expect.objectContaining({
          senderId: '1002',
          status: 'pending'
        }),
        expect.objectContaining({
          senderId: '1001',
          status: 'approved'
        })
      ]
    })
  })

  it('lists whatsapp pairings for a claw', async () => {
    const assistant = await assistantsRepo.create({
      name: 'WhatsApp Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'whatsapp',
      name: 'WhatsApp Device',
      assistantId: assistant.id,
      enabled: true,
      config: {}
    })
    await pairingsRepo.createOrRefreshPending({
      channelId: channel.id,
      remoteChatId: '8613800138000@s.whatsapp.net',
      senderId: '8613800138000@s.whatsapp.net',
      senderDisplayName: 'Alice',
      senderUsername: null,
      code: 'AB7KQ2XM',
      expiresAt: '2099-03-10T01:00:00.000Z',
      lastSeenAt: '2026-03-10T00:00:00.000Z'
    })

    const response = await app.request(`http://localhost/v1/claws/${assistant.id}/pairings`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pairings: [
        expect.objectContaining({
          senderId: '8613800138000@s.whatsapp.net',
          status: 'pending'
        })
      ]
    })
  })

  it('returns whatsapp auth state for a claw', async () => {
    const assistant = await assistantsRepo.create({
      name: 'WhatsApp Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'whatsapp',
      name: 'WhatsApp Device',
      assistantId: assistant.id,
      enabled: true,
      config: {}
    })
    whatsAppAuthStateStore.setQrCode(channel.id, {
      qrCodeValue: 'whatsapp-qr-value',
      qrCodeDataUrl: 'data:image/png;base64,qr'
    })

    const response = await app.request(`http://localhost/v1/claws/${assistant.id}/channel-auth`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      channelId: channel.id,
      channelType: 'whatsapp',
      status: 'qr_ready',
      qrCodeDataUrl: 'data:image/png;base64,qr',
      qrCodeValue: 'whatsapp-qr-value',
      phoneNumber: null,
      errorMessage: null,
      updatedAt: expect.any(String)
    })
  })

  it('returns 404 when auth state is requested for a non-whatsapp claw', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Telegram Assistant',
      providerId,
      enabled: true
    })
    await channelsRepo.create({
      type: 'telegram',
      name: 'Telegram Bot',
      assistantId: assistant.id,
      enabled: true,
      config: {
        botToken: '123456:test-token'
      }
    })

    const response = await app.request(`http://localhost/v1/claws/${assistant.id}/channel-auth`)

    expect(response.status).toBe(404)
  })

  it('lists whatsapp claws as connected only after auth is established', async () => {
    const assistant = await assistantsRepo.create({
      name: 'WhatsApp Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'whatsapp',
      name: 'WhatsApp Device',
      assistantId: assistant.id,
      enabled: true,
      config: {}
    })
    whatsAppAuthStateStore.setConnected(channel.id, '8613800138000')

    const response = await app.request('http://localhost/v1/claws')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      claws: [
        expect.objectContaining({
          id: assistant.id,
          channel: expect.objectContaining({
            id: channel.id,
            type: 'whatsapp',
            status: 'connected'
          })
        })
      ],
      configuredChannels: [
        expect.objectContaining({
          id: channel.id,
          type: 'whatsapp',
          status: 'connected'
        })
      ]
    })
  })

  it('approves a pending telegram pairing', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Telegram Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'telegram',
      name: 'Telegram Bot',
      assistantId: assistant.id,
      enabled: true,
      config: {
        botToken: '123456:test-token'
      }
    })
    const pairing = await pairingsRepo.createOrRefreshPending({
      channelId: channel.id,
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      expiresAt: '2099-03-09T01:00:00.000Z',
      lastSeenAt: '2026-03-09T00:00:00.000Z'
    })

    const response = await app.request(
      `http://localhost/v1/claws/${assistant.id}/pairings/${pairing.id}/approve`,
      {
        method: 'POST'
      }
    )

    expect(response.status).toBe(200)
    await expect(pairingsRepo.getById(pairing.id)).resolves.toMatchObject({
      id: pairing.id,
      status: 'approved'
    })
  })

  it('rejects a pending telegram pairing', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Telegram Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'telegram',
      name: 'Telegram Bot',
      assistantId: assistant.id,
      enabled: true,
      config: {
        botToken: '123456:test-token'
      }
    })
    const pairing = await pairingsRepo.createOrRefreshPending({
      channelId: channel.id,
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      expiresAt: '2099-03-09T01:00:00.000Z',
      lastSeenAt: '2026-03-09T00:00:00.000Z'
    })

    const response = await app.request(
      `http://localhost/v1/claws/${assistant.id}/pairings/${pairing.id}/reject`,
      {
        method: 'POST'
      }
    )

    expect(response.status).toBe(200)
    await expect(pairingsRepo.getById(pairing.id)).resolves.toMatchObject({
      id: pairing.id,
      status: 'rejected'
    })
  })

  it('revokes an approved telegram pairing', async () => {
    const assistant = await assistantsRepo.create({
      name: 'Telegram Assistant',
      providerId,
      enabled: true
    })
    const channel = await channelsRepo.create({
      type: 'telegram',
      name: 'Telegram Bot',
      assistantId: assistant.id,
      enabled: true,
      config: {
        botToken: '123456:test-token'
      }
    })
    const pairing = await pairingsRepo.createOrRefreshPending({
      channelId: channel.id,
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      expiresAt: '2099-03-09T01:00:00.000Z',
      lastSeenAt: '2026-03-09T00:00:00.000Z'
    })
    await pairingsRepo.approve(pairing.id, '2026-03-09T00:05:00.000Z')

    const response = await app.request(
      `http://localhost/v1/claws/${assistant.id}/pairings/${pairing.id}/revoke`,
      {
        method: 'POST'
      }
    )

    expect(response.status).toBe(200)
    await expect(pairingsRepo.getById(pairing.id)).resolves.toMatchObject({
      id: pairing.id,
      status: 'revoked'
    })
  })
})
