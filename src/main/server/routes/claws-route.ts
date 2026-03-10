import type { Hono } from 'hono'
import {
  createDefaultWhatsAppChannelAuthState,
  type WhatsAppAuthStateStore
} from '../../channels/whatsapp-auth-state-store'
import { BUILT_IN_DEFAULT_AGENT_MCP_KEY } from '../../default-agent/default-agent-bootstrap'
import { createDefaultWorkspaceConfig } from '../../mastra/workspace-path-resolver'
import type { AppAssistant, AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type {
  AppChannelPairing,
  ChannelPairingsRepository
} from '../../persistence/repos/channel-pairings-repo'
import type { AppChannel, ChannelsRepository } from '../../persistence/repos/channels-repo'
import type { ProvidersRepository } from '../../persistence/repos/providers-repo'
import {
  createClawSchema,
  createConfiguredChannelSchema,
  updateConfiguredChannelSchema,
  updateClawSchema
} from '../validators/claws-validator'

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
  whatsAppAuthStateStore?: Pick<WhatsAppAuthStateStore, 'get'>
  cronSchedulerService?: CronSchedulerServiceLike
}

type ClawResponse = {
  id: string
  name: string
  description: string
  providerId: string | null
  enabled: boolean
  workspacePath: string | null
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

type ClawChannelAuthResponse = {
  channelId: string
  channelType: 'whatsapp'
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error'
  qrCodeDataUrl: string | null
  qrCodeValue: string | null
  phoneNumber: string | null
  errorMessage: string | null
  updatedAt: string
}

type ConfiguredChannelResponse = {
  id: string
  type: string
  name: string
  assistantId: string | null
  assistantName: string | null
  status: 'connected' | 'disconnected' | 'error'
  errorMessage: string | null
  pairedCount: number
  pendingPairingCount: number
}

function invalidBodyResponse() {
  return { ok: false as const, error: 'Invalid JSON body' }
}

function isBuiltInAssistant(assistant: Pick<AppAssistant, 'mcpConfig'>): boolean {
  return assistant.mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] === true
}

function hasValidChannelConfig(
  channel: Pick<AppChannel, 'assistantId' | 'config' | 'enabled' | 'lastError'>,
  channelType?: string
): boolean {
  return (
    (typeof channel.config.appId === 'string' &&
      channel.config.appId.trim().length > 0 &&
      typeof channel.config.appSecret === 'string' &&
      channel.config.appSecret.trim().length > 0) ||
    (typeof channel.config.botToken === 'string' && channel.config.botToken.trim().length > 0) ||
    channelType === 'whatsapp'
  )
}

async function toChannelStatus(
  channel: Pick<AppChannel, 'id' | 'type' | 'assistantId' | 'config' | 'enabled' | 'lastError'>,
  assistantEnabled: boolean,
  options: RegisterClawsRouteOptions
): Promise<'connected' | 'disconnected' | 'error'> {
  const hasValidConfig = hasValidChannelConfig(channel, channel.type)

  if (channel.lastError) {
    return 'error'
  }

  if (channel.type === 'whatsapp') {
    const authState = options.whatsAppAuthStateStore?.get(channel.id) ?? null
    if (authState?.status === 'error') {
      return 'error'
    }

    if (
      assistantEnabled &&
      channel.enabled &&
      channel.assistantId &&
      hasValidConfig &&
      authState?.status === 'connected'
    ) {
      return 'connected'
    }

    return 'disconnected'
  }

  if (assistantEnabled && channel.enabled && channel.assistantId && hasValidConfig) {
    return 'connected'
  }

  return 'disconnected'
}

function supportsPairings(channelType: string): boolean {
  return channelType === 'telegram' || channelType === 'whatsapp'
}

async function getChannelPairingCounts(
  channel: AppChannel,
  options: RegisterClawsRouteOptions
): Promise<{
  pairedCount: number
  pendingPairingCount: number
}> {
  if (!supportsPairings(channel.type)) {
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
  const workspacePath =
    typeof assistant.workspaceConfig.path === 'string' ? assistant.workspaceConfig.path : null

  return {
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    providerId: assistant.providerId,
    enabled: assistant.enabled,
    workspacePath,
    channel: channel
      ? {
          id: channel.id,
          type: channel.type,
          name: channel.name,
          status: await toChannelStatus(channel, assistant.enabled, options),
          errorMessage: channel.lastError,
          pairedCount: counts?.pairedCount ?? 0,
          pendingPairingCount: counts?.pendingPairingCount ?? 0
        }
      : null
  }
}

async function listConfiguredChannels(
  options: RegisterClawsRouteOptions
): Promise<ConfiguredChannelResponse[]> {
  const [assistants, channels] = await Promise.all([
    options.assistantsRepo.list(),
    options.channelsRepo.list()
  ])
  const visibleAssistants = new Map(
    assistants
      .filter((assistant) => !isBuiltInAssistant(assistant))
      .map((assistant) => [assistant.id, assistant])
  )

  const configuredChannels = await Promise.all(
    channels.map(async (channel) => {
      const assistant = channel.assistantId
        ? (visibleAssistants.get(channel.assistantId) ?? null)
        : null
      if (channel.assistantId && !assistant) {
        return null
      }

      const counts = await getChannelPairingCounts(channel, options)

      return {
        id: channel.id,
        type: channel.type,
        name: channel.name,
        assistantId: channel.assistantId,
        assistantName: assistant?.name ?? null,
        status: await toChannelStatus(channel, assistant?.enabled ?? false, options),
        errorMessage: channel.lastError,
        pairedCount: counts.pairedCount,
        pendingPairingCount: counts.pendingPairingCount
      }
    })
  )

  return configuredChannels.filter(
    (channel): channel is ConfiguredChannelResponse => channel !== null
  )
}

async function toConfiguredChannelResponse(
  channel: AppChannel,
  options: RegisterClawsRouteOptions
): Promise<ConfiguredChannelResponse | null> {
  const assistant = channel.assistantId
    ? await options.assistantsRepo.getById(channel.assistantId)
    : null
  if (channel.assistantId && (!assistant || isBuiltInAssistant(assistant))) {
    return null
  }

  const counts = await getChannelPairingCounts(channel, options)

  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    assistantId: channel.assistantId,
    assistantName: assistant?.name ?? null,
    status: await toChannelStatus(channel, assistant?.enabled ?? false, options),
    errorMessage: channel.lastError,
    pairedCount: counts.pairedCount,
    pendingPairingCount: counts.pendingPairingCount
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
    | { type: 'whatsapp' }
): Record<string, unknown> {
  if (channel.type === 'telegram') {
    return {
      botToken: channel.botToken
    }
  }

  if (channel.type === 'whatsapp') {
    return {}
  }

  return {
    appId: channel.appId,
    appSecret: channel.appSecret
  }
}

function mergeChannelConfig(
  existingChannel: AppChannel,
  channel:
    | { type: 'lark'; appId?: string; appSecret?: string }
    | { type: 'telegram'; botToken?: string }
    | { type: 'whatsapp' }
): Record<string, unknown> {
  if (channel.type === 'telegram') {
    return {
      botToken:
        channel.botToken ??
        (typeof existingChannel.config.botToken === 'string' ? existingChannel.config.botToken : '')
    }
  }

  if (channel.type === 'whatsapp') {
    return existingChannel.config
  }

  return {
    appId:
      channel.appId ??
      (typeof existingChannel.config.appId === 'string' ? existingChannel.config.appId : ''),
    appSecret:
      channel.appSecret ??
      (typeof existingChannel.config.appSecret === 'string' ? existingChannel.config.appSecret : '')
  }
}

async function loadPairingChannelByAssistantId(
  assistantId: string,
  options: RegisterClawsRouteOptions
): Promise<AppChannel | null> {
  const assistant = await loadVisibleAssistant(assistantId, options)
  if (!assistant) {
    return null
  }

  const channel = await options.channelsRepo.getByAssistantId(assistant.id)
  if (!channel || !supportsPairings(channel.type)) {
    return null
  }

  return channel
}

async function loadChannelPairing(input: {
  assistantId: string
  pairingId: string
  options: RegisterClawsRouteOptions
}): Promise<{ channel: AppChannel; pairing: AppChannelPairing } | null> {
  const channel = await loadPairingChannelByAssistantId(input.assistantId, input.options)
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

async function loadWhatsAppChannelByAssistantId(
  assistantId: string,
  options: RegisterClawsRouteOptions
): Promise<AppChannel | null> {
  const assistant = await loadVisibleAssistant(assistantId, options)
  if (!assistant) {
    return null
  }

  const channel = await options.channelsRepo.getByAssistantId(assistant.id)
  if (!channel || channel.type !== 'whatsapp') {
    return null
  }

  return channel
}

async function loadWhatsAppAuthState(
  assistantId: string,
  options: RegisterClawsRouteOptions
): Promise<ClawChannelAuthResponse | null> {
  const channel = await loadWhatsAppChannelByAssistantId(assistantId, options)
  if (!channel) {
    return null
  }

  const authState =
    options.whatsAppAuthStateStore?.get(channel.id) ??
    createDefaultWhatsAppChannelAuthState(channel.id, new Date().toISOString())

  return {
    channelId: channel.id,
    channelType: 'whatsapp',
    status: authState.status,
    qrCodeDataUrl: authState.qrCodeDataUrl,
    qrCodeValue: authState.qrCodeValue,
    phoneNumber: authState.phoneNumber,
    errorMessage: authState.errorMessage,
    updatedAt: authState.updatedAt
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

function resolveAssistantEnabledValue(input: {
  requestedEnabled: boolean | undefined
  hasChannel: boolean
  fallbackEnabled: boolean
}): boolean {
  if (!input.hasChannel) {
    return false
  }

  return input.requestedEnabled ?? input.fallbackEnabled
}

export function registerClawsRoute(app: Hono, options: RegisterClawsRouteOptions): void {
  app.get('/v1/claws', async (context) => {
    return context.json({
      claws: await listVisibleClaws(options),
      configuredChannels: await listConfiguredChannels(options)
    })
  })

  app.post('/v1/claws/channels', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = createConfiguredChannelSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const createdChannel = await options.channelsRepo.create({
      type: parsed.data.type,
      name: parsed.data.name,
      assistantId: null,
      enabled: true,
      config: buildChannelConfig(parsed.data)
    })
    const response = await toConfiguredChannelResponse(createdChannel, options)
    if (!response) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    return context.json(response, 201)
  })

  app.patch('/v1/claws/channels/:channelId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = updateConfiguredChannelSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const existingChannel = await options.channelsRepo.getById(context.req.param('channelId'))
    if (!existingChannel) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    if (existingChannel.type !== parsed.data.type) {
      return context.json({ ok: false, error: 'Channel type cannot be changed' }, 400)
    }

    const updatedChannel = await options.channelsRepo.update(existingChannel.id, {
      name: parsed.data.name,
      config: mergeChannelConfig(existingChannel, parsed.data)
    })
    if (!updatedChannel) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    if (updatedChannel.assistantId) {
      await reloadClawServices(options)
    }

    const response = await toConfiguredChannelResponse(updatedChannel, options)
    if (!response) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    return context.json(response)
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

    const hasChannel = Boolean(parsed.data.channel)

    const workspaceConfig = parsed.data.assistant.workspacePath
      ? { path: parsed.data.assistant.workspacePath }
      : createDefaultWorkspaceConfig(parsed.data.assistant.name)

    const assistant = await options.assistantsRepo.create({
      name: parsed.data.assistant.name,
      providerId: parsed.data.assistant.providerId,
      workspaceConfig,
      enabled: resolveAssistantEnabledValue({
        requestedEnabled: parsed.data.assistant.enabled,
        hasChannel,
        fallbackEnabled: false
      })
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

    const hasChannelAfterUpdate =
      parsed.data.channel?.mode === 'attach' ||
      parsed.data.channel?.mode === 'create' ||
      parsed.data.channel?.mode === 'keep' ||
      (!parsed.data.channel && currentChannel !== null)

    if (parsed.data.assistant) {
      await options.assistantsRepo.update(assistantId, {
        ...parsed.data.assistant,
        enabled: resolveAssistantEnabledValue({
          requestedEnabled: parsed.data.assistant.enabled,
          hasChannel: hasChannelAfterUpdate,
          fallbackEnabled: assistant.enabled
        })
      })
    } else if (!hasChannelAfterUpdate) {
      await options.assistantsRepo.update(assistantId, {
        enabled: false
      })
    }

    await reloadClawServices(options)

    return context.json(await loadClawByAssistantId(assistantId, options))
  })

  app.get('/v1/claws/:assistantId/pairings', async (context) => {
    const assistantId = context.req.param('assistantId')
    const channel = await loadPairingChannelByAssistantId(assistantId, options)
    if (!channel) {
      return context.json({ ok: false, error: 'Pairing-capable channel not found' }, 404)
    }

    const pairings = await options.pairingsRepo.listByChannelId(channel.id)
    return context.json({
      pairings: pairings.map((pairing) => toPairingResponse(pairing))
    })
  })

  app.get('/v1/claws/:assistantId/channel-auth', async (context) => {
    const authState = await loadWhatsAppAuthState(context.req.param('assistantId'), options)
    if (!authState) {
      return context.json({ ok: false, error: 'WhatsApp channel not found' }, 404)
    }

    return context.json(authState)
  })

  app.post('/v1/claws/:assistantId/pairings/:pairingId/approve', async (context) => {
    const resolved = await loadChannelPairing({
      assistantId: context.req.param('assistantId'),
      pairingId: context.req.param('pairingId'),
      options
    })
    if (!resolved) {
      return context.json({ ok: false, error: 'Channel pairing not found' }, 404)
    }

    const updated = await options.pairingsRepo.approve(
      resolved.pairing.id,
      new Date().toISOString()
    )
    if (!updated) {
      return context.json({ ok: false, error: 'Channel pairing not found' }, 404)
    }

    return context.json(toPairingResponse(updated))
  })

  app.post('/v1/claws/:assistantId/pairings/:pairingId/reject', async (context) => {
    const resolved = await loadChannelPairing({
      assistantId: context.req.param('assistantId'),
      pairingId: context.req.param('pairingId'),
      options
    })
    if (!resolved) {
      return context.json({ ok: false, error: 'Channel pairing not found' }, 404)
    }

    const updated = await options.pairingsRepo.reject(resolved.pairing.id, new Date().toISOString())
    if (!updated) {
      return context.json({ ok: false, error: 'Channel pairing not found' }, 404)
    }

    return context.json(toPairingResponse(updated))
  })

  app.post('/v1/claws/:assistantId/pairings/:pairingId/revoke', async (context) => {
    const resolved = await loadChannelPairing({
      assistantId: context.req.param('assistantId'),
      pairingId: context.req.param('pairingId'),
      options
    })
    if (!resolved) {
      return context.json({ ok: false, error: 'Channel pairing not found' }, 404)
    }

    const updated = await options.pairingsRepo.revoke(resolved.pairing.id, new Date().toISOString())
    if (!updated) {
      return context.json({ ok: false, error: 'Channel pairing not found' }, 404)
    }

    return context.json(toPairingResponse(updated))
  })

  app.delete('/v1/claws/channels/:channelId', async (context) => {
    const channelId = context.req.param('channelId')
    const channel = await options.channelsRepo.getById(channelId)
    if (!channel) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    if (channel.assistantId) {
      return context.json({ ok: false, error: 'Channel is attached to an assistant' }, 409)
    }

    await options.channelsRepo.delete(channelId)
    return context.body(null, 204)
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
