import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_DEFAULT_AGENT_MCP_KEY } from '../../default-agent/default-agent-bootstrap'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ChannelsRepository } from '../../persistence/repos/channels-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { registerClawsRoute } from './claws-route'

describe('claws route', () => {
  let db: AppDatabase
  let app: Hono
  let providersRepo: ProvidersRepository
  let assistantsRepo: AssistantsRepository
  let channelsRepo: ChannelsRepository
  let reloadMock: ReturnType<typeof vi.fn<() => Promise<void>>>
  let providerId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    providersRepo = new ProvidersRepository(db)
    assistantsRepo = new AssistantsRepository(db)
    channelsRepo = new ChannelsRepository(db)
    reloadMock = vi.fn(async () => undefined)
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
      channelService: {
        reload: reloadMock
      }
    })
  })

  afterEach(() => {
    db.close()
  })

  it('lists non-built-in claws and available unbound channels', async () => {
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
    await channelsRepo.create({
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
      availableChannels: [
        expect.objectContaining({
          id: unboundChannel.id,
          name: 'Extra Lark'
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
    expect(reloadMock).toHaveBeenCalledOnce()
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
    expect(reloadMock).toHaveBeenCalledOnce()
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
    expect(reloadMock).not.toHaveBeenCalled()
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
    expect(reloadMock).toHaveBeenCalledOnce()
  })
})
