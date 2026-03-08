import type { Hono } from 'hono'
import { BUILT_IN_DEFAULT_AGENT_MCP_KEY } from '../../default-agent/default-agent-bootstrap'
import type { AppAssistant, AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { AppChannel, ChannelsRepository } from '../../persistence/repos/channels-repo'
import type { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { createClawSchema, updateClawSchema } from '../validators/claws-validator'

type ChannelServiceLike = {
  reload(): Promise<void>
}

type RegisterClawsRouteOptions = {
  assistantsRepo: AssistantsRepository
  providersRepo: ProvidersRepository
  channelsRepo: ChannelsRepository
  channelService: ChannelServiceLike
}

type ClawResponse = {
  id: string
  name: string
  description: string
  instructions: string
  providerId: string | null
  enabled: boolean
  channel: null | {
    id: string
    type: string
    name: string
    status: 'connected' | 'disconnected' | 'error'
    errorMessage: string | null
  }
}

function invalidBodyResponse() {
  return { ok: false as const, error: 'Invalid JSON body' }
}

function isBuiltInAssistant(assistant: Pick<AppAssistant, 'mcpConfig'>): boolean {
  return assistant.mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] === true
}

function toChannelStatus(
  channel: Pick<AppChannel, 'assistantId' | 'config' | 'enabled' | 'lastError'>,
  assistantEnabled: boolean
): 'connected' | 'disconnected' | 'error' {
  const appId = typeof channel.config.appId === 'string' ? channel.config.appId.trim() : ''
  const appSecret =
    typeof channel.config.appSecret === 'string' ? channel.config.appSecret.trim() : ''

  if (channel.lastError) {
    return 'error'
  }

  if (assistantEnabled && channel.enabled && channel.assistantId && appId.length > 0 && appSecret.length > 0) {
    return 'connected'
  }

  return 'disconnected'
}

function toClawResponse(
  assistant: AppAssistant,
  channel: AppChannel | null
): ClawResponse {
  return {
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    instructions: assistant.instructions,
    providerId: assistant.providerId,
    enabled: assistant.enabled,
    channel: channel
      ? {
          id: channel.id,
          type: channel.type,
          name: channel.name,
          status: toChannelStatus(channel, assistant.enabled),
          errorMessage: channel.lastError
        }
      : null
  }
}

async function listVisibleClaws(options: RegisterClawsRouteOptions): Promise<ClawResponse[]> {
  const assistants = await options.assistantsRepo.list()
  const channels = await options.channelsRepo.list()
  const channelsByAssistantId = new Map<string, AppChannel>()

  for (const channel of channels) {
    if (!channel.assistantId || channelsByAssistantId.has(channel.assistantId)) {
      continue
    }

    channelsByAssistantId.set(channel.assistantId, channel)
  }

  return assistants
    .filter((assistant) => !isBuiltInAssistant(assistant))
    .map((assistant) => toClawResponse(assistant, channelsByAssistantId.get(assistant.id) ?? null))
}

async function loadVisibleAssistant(
  assistantId: string,
  options: RegisterClawsRouteOptions
): Promise<AppAssistant | null> {
  const assistant = await options.assistantsRepo.getById(assistantId)
  if (!assistant || isBuiltInAssistant(assistant)) {
    return null
  }

  return assistant
}

async function loadClawByAssistantId(
  assistantId: string,
  options: RegisterClawsRouteOptions
): Promise<ClawResponse | null> {
  const assistant = await loadVisibleAssistant(assistantId, options)
  if (!assistant) {
    return null
  }

  const channel = await options.channelsRepo.getByAssistantId(assistant.id)
  return toClawResponse(assistant, channel)
}

async function attachChannelToAssistant(input: {
  assistantId: string
  channelId: string
  options: RegisterClawsRouteOptions
}): Promise<{ ok: true } | { ok: false; error: string; status: 404 | 409 }> {
  const existingChannel = await input.options.channelsRepo.getById(input.channelId)
  if (!existingChannel) {
    return { ok: false, error: 'Channel not found', status: 404 }
  }

  if (existingChannel.assistantId && existingChannel.assistantId !== input.assistantId) {
    return { ok: false, error: 'Channel is already attached to another assistant', status: 409 }
  }

  const currentChannel = await input.options.channelsRepo.getByAssistantId(input.assistantId)
  if (currentChannel && currentChannel.id !== existingChannel.id) {
    await input.options.channelsRepo.update(currentChannel.id, {
      assistantId: null
    })
  }

  await input.options.channelsRepo.update(existingChannel.id, {
    assistantId: input.assistantId,
    enabled: true
  })

  return { ok: true }
}

export function registerClawsRoute(app: Hono, options: RegisterClawsRouteOptions): void {
  app.get('/v1/claws', async (context) => {
    const availableChannels = await options.channelsRepo.listUnbound()
    return context.json({
      claws: await listVisibleClaws(options),
      availableChannels: availableChannels.map((channel) => ({
        id: channel.id,
        type: channel.type,
        name: channel.name
      }))
    })
  })

  app.post('/v1/claws', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = createClawSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const provider = await options.providersRepo.getById(parsed.data.assistant.providerId)
    if (!provider) {
      return context.json({ ok: false, error: 'Provider not found' }, 400)
    }

    if (parsed.data.channel?.mode === 'attach') {
      const targetChannel = await options.channelsRepo.getById(parsed.data.channel.channelId)
      if (!targetChannel) {
        return context.json({ ok: false, error: 'Channel not found' }, 404)
      }

      if (targetChannel.assistantId) {
        return context.json(
          { ok: false, error: 'Channel is already attached to another assistant' },
          409
        )
      }
    }

    const assistant = await options.assistantsRepo.create({
      name: parsed.data.assistant.name,
      instructions: parsed.data.assistant.instructions,
      providerId: parsed.data.assistant.providerId,
      enabled: parsed.data.assistant.enabled
    })

    if (parsed.data.channel?.mode === 'create') {
      await options.channelsRepo.create({
        type: parsed.data.channel.type,
        name: parsed.data.channel.name,
        assistantId: assistant.id,
        enabled: true,
        config: {
          appId: parsed.data.channel.appId,
          appSecret: parsed.data.channel.appSecret
        }
      })
    } else if (parsed.data.channel?.mode === 'attach') {
      const attachResult = await attachChannelToAssistant({
        assistantId: assistant.id,
        channelId: parsed.data.channel.channelId,
        options
      })
      if (!attachResult.ok) {
        return context.json({ ok: false, error: attachResult.error }, attachResult.status)
      }
    }

    await options.channelService.reload()

    return context.json(await loadClawByAssistantId(assistant.id, options), 201)
  })

  app.patch('/v1/claws/:assistantId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = updateClawSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const assistantId = context.req.param('assistantId')
    const assistant = await loadVisibleAssistant(assistantId, options)
    if (!assistant) {
      return context.json({ ok: false, error: 'Claw not found' }, 404)
    }

    if (parsed.data.assistant?.providerId) {
      const provider = await options.providersRepo.getById(parsed.data.assistant.providerId)
      if (!provider) {
        return context.json({ ok: false, error: 'Provider not found' }, 400)
      }
    }

    if (parsed.data.assistant) {
      await options.assistantsRepo.update(assistantId, parsed.data.assistant)
    }

    const currentChannel = await options.channelsRepo.getByAssistantId(assistantId)

    if (parsed.data.channel?.mode === 'attach') {
      const attachResult = await attachChannelToAssistant({
        assistantId,
        channelId: parsed.data.channel.channelId,
        options
      })
      if (!attachResult.ok) {
        return context.json({ ok: false, error: attachResult.error }, attachResult.status)
      }
    } else if (parsed.data.channel?.mode === 'create') {
      if (currentChannel) {
        await options.channelsRepo.update(currentChannel.id, {
          assistantId: null
        })
      }

      await options.channelsRepo.create({
        type: parsed.data.channel.type,
        name: parsed.data.channel.name,
        assistantId,
        enabled: true,
        config: {
          appId: parsed.data.channel.appId,
          appSecret: parsed.data.channel.appSecret
        }
      })
    } else if (parsed.data.channel?.mode === 'detach' && currentChannel) {
      await options.channelsRepo.update(currentChannel.id, {
        assistantId: null
      })
    }

    await options.channelService.reload()

    return context.json(await loadClawByAssistantId(assistantId, options))
  })

  app.delete('/v1/claws/:assistantId', async (context) => {
    const assistantId = context.req.param('assistantId')
    const assistant = await loadVisibleAssistant(assistantId, options)
    if (!assistant) {
      return context.json({ ok: false, error: 'Claw not found' }, 404)
    }

    const deleted = await options.assistantsRepo.delete(assistantId)
    if (!deleted) {
      return context.json({ ok: false, error: 'Claw not found' }, 404)
    }

    await options.channelService.reload()

    return context.body(null, 204)
  })
}
