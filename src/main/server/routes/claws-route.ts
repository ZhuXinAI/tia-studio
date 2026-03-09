import type { Hono } from 'hono'
import { BUILT_IN_DEFAULT_AGENT_MCP_KEY } from '../../default-agent/default-agent-bootstrap'
import type { AppAssistant, AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type {
  AppChannelPairing,
  ChannelPairingsRepository
} from '../../persistence/repos/channel-pairings-repo'
import type { AppChannel, ChannelsRepository } from '../../persistence/repos/channels-repo'
import type { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { createClawSchema, updateClawSchema } from '../validators/claws-validator'

type ChannelServiceLike = {
  reload(): Promise<void>
}

type CronSchedulerServiceLike = {
  reload(): Promise<void>
}

type RegisterClawsRouteOptions = {
  assistantsRepo: AssistantsRepository
  providersRepo: ProvidersRepository
  channelsRepo: ChannelsRepository
  pairingsRepo: Pick<
    ChannelPairingsRepository,
    | 'countByChannelIdAndStatus'
    | 'countActivePendingByChannelId'
    | 'listByChannelId'
    | 'getById'
    | 'approve'
    | 'reject'
    | 'revoke'
  >
  channelService: ChannelServiceLike
  cronSchedulerService?: CronSchedulerServiceLike
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
    pairedCount: number
    pendingPairingCount: number
  }
}

type ClawPairingResponse = {
  id: string
  channelId: string
  remoteChatId: string
  senderId: string
  senderDisplayName: string
  senderUsername: string | null
  code: string
  status: string
  expiresAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  revokedAt: string | null
  lastSeenAt: string
  createdAt: string
  updatedAt: string
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
  const hasValidConfig =
    (typeof channel.config.appId === 'string' &&
      channel.config.appId.trim().length > 0 &&
      typeof channel.config.appSecret === 'string' &&
      channel.config.appSecret.trim().length > 0) ||
    (typeof channel.config.botToken === 'string' && channel.config.botToken.trim().length > 0)

  if (channel.lastError) {
    return 'error'
  }

  if (assistantEnabled && channel.enabled && channel.assistantId && hasValidConfig) {
    return 'connected'
  }

  return 'disconnected'
}

async function getChannelPairingCounts(
  channel: AppChannel,
  options: RegisterClawsRouteOptions
): Promise<{
  pairedCount: number
  pendingPairingCount: number
}> {
  if (channel.type !== 'telegram') {
    return {
      pairedCount: 0,
      pendingPairingCount: 0
    }
  }

  const now = new Date().toISOString()
  const [pairedCount, pendingPairingCount] = await Promise.all([
    options.pairingsRepo.countByChannelIdAndStatus(channel.id, 'approved'),
    options.pairingsRepo.countActivePendingByChannelId(channel.id, now)
  ])

  return {
    pairedCount,
    pendingPairingCount
  }
}

async function toClawResponse(
  assistant: AppAssistant,
  channel: AppChannel | null,
  options: RegisterClawsRouteOptions
): Promise<ClawResponse> {
  const counts = channel ? await getChannelPairingCounts(channel, options) : null

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
          errorMessage: channel.lastError,
          pairedCount: counts?.pairedCount ?? 0,
          pendingPairingCount: counts?.pendingPairingCount ?? 0
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

  return Promise.all(
    assistants
      .filter((assistant) => !isBuiltInAssistant(assistant))
      .map((assistant) =>
        toClawResponse(assistant, channelsByAssistantId.get(assistant.id) ?? null, options)
      )
  )
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
  return toClawResponse(assistant, channel, options)
}

function toPairingResponse(pairing: AppChannelPairing): ClawPairingResponse {
  return {
    id: pairing.id,
    channelId: pairing.channelId,
    remoteChatId: pairing.remoteChatId,
    senderId: pairing.senderId,
    senderDisplayName: pairing.senderDisplayName,
    senderUsername: pairing.senderUsername,
    code: pairing.code,
    status: pairing.status,
    expiresAt: pairing.expiresAt,
    approvedAt: pairing.approvedAt,
    rejectedAt: pairing.rejectedAt,
    revokedAt: pairing.revokedAt,
    lastSeenAt: pairing.lastSeenAt,
    createdAt: pairing.createdAt,
    updatedAt: pairing.updatedAt
  }
}

function buildChannelConfig(
  channel:
    | { type: 'lark'; appId: string; appSecret: string }
    | { type: 'telegram'; botToken: string }
): Record<string, unknown> {
  if (channel.type === 'telegram') {
    return {
      botToken: channel.botToken
    }
  }

  return {
    appId: channel.appId,
    appSecret: channel.appSecret
  }
}

async function loadTelegramChannelByAssistantId(
  assistantId: string,
  options: RegisterClawsRouteOptions
): Promise<AppChannel | null> {
  const assistant = await loadVisibleAssistant(assistantId, options)
  if (!assistant) {
    return null
  }

  const channel = await options.channelsRepo.getByAssistantId(assistant.id)
  if (!channel || channel.type !== 'telegram') {
    return null
  }

  return channel
}

async function loadTelegramPairing(input: {
  assistantId: string
  pairingId: string
  options: RegisterClawsRouteOptions
}): Promise<{ channel: AppChannel; pairing: AppChannelPairing } | null> {
  const channel = await loadTelegramChannelByAssistantId(input.assistantId, input.options)
  if (!channel) {
    return null
  }

  const pairing = await input.options.pairingsRepo.getById(input.pairingId)
  if (!pairing || pairing.channelId !== channel.id) {
    return null
  }

  return {
    channel,
    pairing
  }
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

async function reloadClawServices(options: RegisterClawsRouteOptions): Promise<void> {
  await options.channelService.reload()
  await options.cronSchedulerService?.reload()
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
        config: buildChannelConfig(parsed.data.channel)
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

    await reloadClawServices(options)

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
        config: buildChannelConfig(parsed.data.channel)
      })
    } else if (parsed.data.channel?.mode === 'detach' && currentChannel) {
      await options.channelsRepo.update(currentChannel.id, {
        assistantId: null
      })
    }

    await reloadClawServices(options)

    return context.json(await loadClawByAssistantId(assistantId, options))
  })

  app.get('/v1/claws/:assistantId/pairings', async (context) => {
    const assistantId = context.req.param('assistantId')
    const channel = await loadTelegramChannelByAssistantId(assistantId, options)
    if (!channel) {
      return context.json({ ok: false, error: 'Telegram channel not found' }, 404)
    }

    const pairings = await options.pairingsRepo.listByChannelId(channel.id)
    return context.json({
      pairings: pairings.map((pairing) => toPairingResponse(pairing))
    })
  })

  app.post('/v1/claws/:assistantId/pairings/:pairingId/approve', async (context) => {
    const resolved = await loadTelegramPairing({
      assistantId: context.req.param('assistantId'),
      pairingId: context.req.param('pairingId'),
      options
    })
    if (!resolved) {
      return context.json({ ok: false, error: 'Telegram pairing not found' }, 404)
    }

    const updated = await options.pairingsRepo.approve(
      resolved.pairing.id,
      new Date().toISOString()
    )
    if (!updated) {
      return context.json({ ok: false, error: 'Telegram pairing not found' }, 404)
    }

    return context.json(toPairingResponse(updated))
  })

  app.post('/v1/claws/:assistantId/pairings/:pairingId/reject', async (context) => {
    const resolved = await loadTelegramPairing({
      assistantId: context.req.param('assistantId'),
      pairingId: context.req.param('pairingId'),
      options
    })
    if (!resolved) {
      return context.json({ ok: false, error: 'Telegram pairing not found' }, 404)
    }

    const updated = await options.pairingsRepo.reject(resolved.pairing.id, new Date().toISOString())
    if (!updated) {
      return context.json({ ok: false, error: 'Telegram pairing not found' }, 404)
    }

    return context.json(toPairingResponse(updated))
  })

  app.post('/v1/claws/:assistantId/pairings/:pairingId/revoke', async (context) => {
    const resolved = await loadTelegramPairing({
      assistantId: context.req.param('assistantId'),
      pairingId: context.req.param('pairingId'),
      options
    })
    if (!resolved) {
      return context.json({ ok: false, error: 'Telegram pairing not found' }, 404)
    }

    const updated = await options.pairingsRepo.revoke(resolved.pairing.id, new Date().toISOString())
    if (!updated) {
      return context.json({ ok: false, error: 'Telegram pairing not found' }, 404)
    }

    return context.json(toPairingResponse(updated))
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

    await reloadClawServices(options)

    return context.body(null, 204)
  })
}
