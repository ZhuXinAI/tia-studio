import type { Hono } from 'hono'
import { DEFAULT_AGENT_NAME } from '../../default-agent/default-agent-bootstrap'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { ChannelsRepository } from '../../persistence/repos/channels-repo'

type RegisterMigrationRouteOptions = {
  assistantsRepo: AssistantsRepository
  channelsRepo: ChannelsRepository
  channelService: {
    reload(): Promise<void>
  }
}

type MigrationStatusResponse = {
  needsMigration: boolean
  channelCountToRebind: number
  legacyCleanup: {
    heartbeat: 'removed'
    scheduling: 'removed'
  }
  defaultAssistantName: string
}

async function getMigrationStatus(
  options: RegisterMigrationRouteOptions
): Promise<MigrationStatusResponse> {
  const defaultAssistant = await options.assistantsRepo.findBuiltInDefault()
  const channels = await options.channelsRepo.list()
  const channelCountToRebind = defaultAssistant
    ? channels.filter((channel) => channel.assistantId !== defaultAssistant.id).length
    : channels.length

  return {
    needsMigration: channelCountToRebind > 0,
    channelCountToRebind,
    legacyCleanup: {
      heartbeat: 'removed',
      scheduling: 'removed'
    },
    defaultAssistantName: defaultAssistant?.name ?? DEFAULT_AGENT_NAME
  }
}

export function registerMigrationRoute(app: Hono, options: RegisterMigrationRouteOptions): void {
  app.get('/v1/migration/status', async (context) => {
    return context.json(await getMigrationStatus(options))
  })

  app.post('/v1/migration/run', async (context) => {
    const defaultAssistant = await options.assistantsRepo.findBuiltInDefault()
    if (!defaultAssistant) {
      return context.json(
        {
          ok: false,
          error: 'Default assistant is not configured'
        },
        409
      )
    }

    const channels = await options.channelsRepo.list()
    const channelsToRebind = channels.filter(
      (channel) => channel.assistantId !== defaultAssistant.id
    )

    await Promise.all(
      channelsToRebind.map((channel) =>
        options.channelsRepo.update(channel.id, {
          assistantId: defaultAssistant.id
        })
      )
    )

    if (channelsToRebind.length > 0) {
      await options.channelService.reload()
    }

    return context.json({
      ok: true,
      migratedChannelCount: channelsToRebind.length,
      status: await getMigrationStatus(options)
    })
  })
}
