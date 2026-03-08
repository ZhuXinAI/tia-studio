import type { Hono } from 'hono'
import type { ChannelsRepository } from '../../persistence/repos/channels-repo'
import { updateChannelsSettingsSchema } from '../validators/channels-validator'

type ChannelServiceLike = {
  reload(): Promise<void>
}

type RegisterChannelsSettingsRouteOptions = {
  channelsRepo: ChannelsRepository
  channelService: ChannelServiceLike
}

type ChannelsSettingsResponse = {
  lark: {
    id: string | null
    enabled: boolean
    name: string
    assistantId: string | null
    appId: string
    appSecret: string
    status: 'disconnected' | 'connected' | 'error'
    errorMessage: string | null
  }
}

function parseJsonBodyErrorResponse(): {
  ok: false
  error: string
} {
  return {
    ok: false,
    error: 'Invalid JSON body'
  }
}

async function loadLarkChannel(channelsRepo: ChannelsRepository) {
  const channels = await channelsRepo.getByType('lark')
  return channels[0] ?? null
}

function toChannelsSettingsResponse(channel: Awaited<ReturnType<typeof loadLarkChannel>>): ChannelsSettingsResponse {
  const appId = typeof channel?.config.appId === 'string' ? channel.config.appId : ''
  const appSecret = typeof channel?.config.appSecret === 'string' ? channel.config.appSecret : ''
  const status =
    channel?.lastError != null
      ? 'error'
      : channel?.enabled && channel.assistantId && appId.length > 0 && appSecret.length > 0
        ? 'connected'
        : 'disconnected'

  return {
    lark: {
      id: channel?.id ?? null,
      enabled: channel?.enabled ?? false,
      name: channel?.name ?? 'Lark',
      assistantId: channel?.assistantId ?? null,
      appId,
      appSecret,
      status,
      errorMessage: channel?.lastError ?? null
    }
  }
}

export function registerChannelsSettingsRoute(
  app: Hono,
  options: RegisterChannelsSettingsRouteOptions
): void {
  app.get('/v1/settings/channels', async (context) => {
    return context.json(toChannelsSettingsResponse(await loadLarkChannel(options.channelsRepo)))
  })

  app.put('/v1/settings/channels', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(parseJsonBodyErrorResponse(), 400)
    }

    const parsed = updateChannelsSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const existingChannel = await loadLarkChannel(options.channelsRepo)
    if (existingChannel) {
      await options.channelsRepo.update(existingChannel.id, {
        type: 'lark',
        name: parsed.data.lark.name,
        assistantId: parsed.data.lark.assistantId,
        enabled: parsed.data.lark.enabled,
        config: {
          appId: parsed.data.lark.appId,
          appSecret: parsed.data.lark.appSecret
        },
        lastError: null
      })
    } else {
      await options.channelsRepo.create({
        type: 'lark',
        name: parsed.data.lark.name,
        assistantId: parsed.data.lark.assistantId,
        enabled: parsed.data.lark.enabled,
        config: {
          appId: parsed.data.lark.appId,
          appSecret: parsed.data.lark.appSecret
        },
        lastError: null
      })
    }

    await options.channelService.reload()

    return context.json(toChannelsSettingsResponse(await loadLarkChannel(options.channelsRepo)))
  })
}
