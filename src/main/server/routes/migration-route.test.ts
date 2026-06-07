import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_DEFAULT_AGENT_MCP_KEY } from '../../default-agent/default-agent-bootstrap'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ChannelsRepository } from '../../persistence/repos/channels-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { registerMigrationRoute } from './migration-route'

describe('migration route', () => {
  let db: AppDatabase
  let app: Hono
  let providersRepo: ProvidersRepository
  let assistantsRepo: AssistantsRepository
  let channelsRepo: ChannelsRepository
  let channelReloadMock: ReturnType<typeof vi.fn<() => Promise<void>>>
  let defaultAssistantId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    providersRepo = new ProvidersRepository(db)
    assistantsRepo = new AssistantsRepository(db)
    channelsRepo = new ChannelsRepository(db)
    channelReloadMock = vi.fn(async () => undefined)
    app = new Hono()

    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const defaultAssistant = await assistantsRepo.create({
      name: 'Default Agent',
      providerId: provider.id,
      enabled: true,
      mcpConfig: {
        [BUILT_IN_DEFAULT_AGENT_MCP_KEY]: true
      }
    })
    defaultAssistantId = defaultAssistant.id

    registerMigrationRoute(app, {
      assistantsRepo,
      channelsRepo,
      channelService: {
        reload: channelReloadMock
      }
    })
  })

  afterEach(() => {
    db.close()
  })

  it('reports and migrates channels to the built-in default assistant', async () => {
    const oldAssistant = await assistantsRepo.create({
      name: 'Legacy Assistant',
      providerId: null,
      enabled: true
    })
    const legacyChannel = await channelsRepo.create({
      type: 'lark',
      name: 'Legacy Lark',
      assistantId: oldAssistant.id,
      enabled: true,
      config: {
        appId: 'cli_legacy',
        appSecret: 'secret'
      }
    })
    await channelsRepo.create({
      type: 'telegram',
      name: 'Default Telegram',
      assistantId: defaultAssistantId,
      enabled: true,
      config: {
        botToken: '123456:token'
      }
    })

    const statusResponse = await app.request('http://localhost/v1/migration/status')
    await expect(statusResponse.json()).resolves.toMatchObject({
      needsMigration: true,
      channelCountToRebind: 1,
      legacyCleanup: {
        heartbeat: 'removed',
        scheduling: 'removed'
      }
    })

    const runResponse = await app.request('http://localhost/v1/migration/run', {
      method: 'POST'
    })

    expect(runResponse.status).toBe(200)
    await expect(runResponse.json()).resolves.toMatchObject({
      ok: true,
      migratedChannelCount: 1,
      status: {
        needsMigration: false,
        channelCountToRebind: 0
      }
    })
    await expect(channelsRepo.getById(legacyChannel.id)).resolves.toMatchObject({
      assistantId: defaultAssistantId
    })
    expect(channelReloadMock).toHaveBeenCalledOnce()
  })
})
