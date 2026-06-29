import type { Hono } from 'hono'
import {
  type WhatsAppAuthStateStore,
  type WhatsAppChannelAuthState
} from '../../channels/whatsapp-auth-state-store'
import {
  type WechatAuthStateStore,
  type WechatChannelAuthState
} from '../../channels/wechat-auth-state-store'
import { resolveGroupRequireMention } from '../../channels/channel-config'
import {
  BUILT_IN_DEFAULT_AGENT_MCP_KEY,
  DEFAULT_AGENT_NAME
} from '../../default-agent/default-agent-bootstrap'
import type { AppAssistant, AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { ChannelPairingsRepository } from '../../persistence/repos/channel-pairings-repo'
import type { AppChannel, ChannelsRepository } from '../../persistence/repos/channels-repo'
import {
  createConfiguredChannelSchema,
  updateConfiguredChannelSchema
} from '../validators/channels-validator'

type ChannelServiceLike = {
  reload(): Promise<void>
}

type ChannelSetupRecoveryLike = {
  recover(channel: Pick<AppChannel, 'id' | 'type'>): Promise<void>
}

type RegisterChannelsRouteOptions = {
  assistantsRepo: AssistantsRepository
  channelsRepo: ChannelsRepository
  pairingsRepo: Pick<
    ChannelPairingsRepository,
    'countByChannelIdAndStatus' | 'countActivePendingByChannelId'
  >
  channelService: ChannelServiceLike
  channelSetupRecovery?: ChannelSetupRecoveryLike
  whatsAppAuthStateStore?: Pick<WhatsAppAuthStateStore, 'get'>
  wechatAuthStateStore?: Pick<WechatAuthStateStore, 'get'>
}

type ConfiguredChannelResponse = {
  id: string
  type: string
  name: string
  groupRequireMention: boolean
  assistantId: string | null
  assistantName: string | null
  status: 'connected' | 'disconnected' | 'error'
  errorMessage: string | null
  pairedCount: number
  pendingPairingCount: number
  authState: ChannelAuthStateResponse | null
}

type ChannelAuthStateResponse = {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error'
  qrCodeDataUrl: string | null
  qrCodeValue: string | null
  accountLabel: string | null
  errorMessage: string | null
  updatedAt: string
}

function invalidBodyResponse() {
  return { ok: false as const, error: 'Invalid JSON body' }
}

function isBuiltInAssistant(assistant: Pick<AppAssistant, 'mcpConfig'>): boolean {
  return assistant.mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] === true
}

function toAssistantDisplayName(assistant: AppAssistant | null): string | null {
  if (!assistant) {
    return null
  }

  return isBuiltInAssistant(assistant) ? DEFAULT_AGENT_NAME : assistant.name
}

async function loadBuiltInDefaultAssistant(
  options: RegisterChannelsRouteOptions
): Promise<AppAssistant | null> {
  return options.assistantsRepo.findBuiltInDefault()
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
    (typeof channel.config.botId === 'string' &&
      channel.config.botId.trim().length > 0 &&
      typeof channel.config.secret === 'string' &&
      channel.config.secret.trim().length > 0) ||
    (typeof channel.config.serverUrl === 'string' &&
      channel.config.serverUrl.trim().length > 0 &&
      typeof channel.config.serverKey === 'string' &&
      channel.config.serverKey.trim().length > 0) ||
    (typeof channel.config.botToken === 'string' && channel.config.botToken.trim().length > 0) ||
    channelType === 'whatsapp' ||
    channelType === 'wechat'
  )
}

async function toChannelStatus(
  channel: Pick<AppChannel, 'id' | 'type' | 'assistantId' | 'config' | 'enabled' | 'lastError'>,
  assistantEnabled: boolean,
  options: RegisterChannelsRouteOptions
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

  if (channel.type === 'wechat') {
    const authState = options.wechatAuthStateStore?.get(channel.id) ?? null
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
  options: RegisterChannelsRouteOptions
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

async function listConfiguredChannels(
  options: RegisterChannelsRouteOptions
): Promise<ConfiguredChannelResponse[]> {
  const [assistants, channels] = await Promise.all([
    options.assistantsRepo.list(),
    options.channelsRepo.list()
  ])
  const assistantById = new Map(assistants.map((assistant) => [assistant.id, assistant]))

  const configuredChannels = await Promise.all(
    channels.map(async (channel) => {
      const assistant = channel.assistantId
        ? (assistantById.get(channel.assistantId) ?? null)
        : null
      if (channel.assistantId && !assistant) {
        return null
      }

      const counts = await getChannelPairingCounts(channel, options)

      return {
        id: channel.id,
        type: channel.type,
        name: channel.name,
        groupRequireMention: resolveGroupRequireMention(channel.config),
        assistantId: channel.assistantId,
        assistantName: toAssistantDisplayName(assistant),
        status: await toChannelStatus(channel, assistant?.enabled ?? false, options),
        errorMessage: channel.lastError,
        pairedCount: counts.pairedCount,
        pendingPairingCount: counts.pendingPairingCount,
        authState: toChannelAuthStateResponse(channel, options)
      }
    })
  )

  return configuredChannels.filter(
    (channel): channel is ConfiguredChannelResponse => channel !== null
  )
}

async function toConfiguredChannelResponse(
  channel: AppChannel,
  options: RegisterChannelsRouteOptions
): Promise<ConfiguredChannelResponse | null> {
  const assistant = channel.assistantId
    ? await options.assistantsRepo.getById(channel.assistantId)
    : null
  if (channel.assistantId && !assistant) {
    return null
  }

  const counts = await getChannelPairingCounts(channel, options)

  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    groupRequireMention: resolveGroupRequireMention(channel.config),
    assistantId: channel.assistantId,
    assistantName: toAssistantDisplayName(assistant),
    status: await toChannelStatus(channel, assistant?.enabled ?? false, options),
    errorMessage: channel.lastError,
    pairedCount: counts.pairedCount,
    pendingPairingCount: counts.pendingPairingCount,
    authState: toChannelAuthStateResponse(channel, options)
  }
}

function toWhatsAppAuthStateResponse(
  authState: WhatsAppChannelAuthState | null
): ChannelAuthStateResponse | null {
  if (!authState) {
    return null
  }

  return {
    status: authState.status,
    qrCodeDataUrl: authState.qrCodeDataUrl,
    qrCodeValue: authState.qrCodeValue,
    accountLabel: authState.phoneNumber,
    errorMessage: authState.errorMessage,
    updatedAt: authState.updatedAt
  }
}

function toWechatAuthStateResponse(
  authState: WechatChannelAuthState | null
): ChannelAuthStateResponse | null {
  if (!authState) {
    return null
  }

  return {
    status: authState.status,
    qrCodeDataUrl: authState.qrCodeDataUrl,
    qrCodeValue: authState.qrCodeValue,
    accountLabel: authState.accountId,
    errorMessage: authState.errorMessage,
    updatedAt: authState.updatedAt
  }
}

function toChannelAuthStateResponse(
  channel: Pick<AppChannel, 'id' | 'type'>,
  options: RegisterChannelsRouteOptions
): ChannelAuthStateResponse | null {
  if (channel.type === 'whatsapp') {
    return toWhatsAppAuthStateResponse(options.whatsAppAuthStateStore?.get(channel.id) ?? null)
  }

  if (channel.type === 'wechat') {
    return toWechatAuthStateResponse(options.wechatAuthStateStore?.get(channel.id) ?? null)
  }

  return null
}

async function loadVisibleConfiguredChannelById(
  channelId: string,
  options: RegisterChannelsRouteOptions
): Promise<AppChannel | null> {
  const channel = await options.channelsRepo.getById(channelId)
  if (!channel) {
    return null
  }

  if (!channel.assistantId) {
    return channel
  }

  const assistant = await options.assistantsRepo.getById(channel.assistantId)
  if (!assistant) {
    return null
  }

  return channel
}

function buildChannelConfig(
  channel:
    | { type: 'lark'; appId: string; appSecret: string; groupRequireMention?: boolean }
    | { type: 'telegram'; botToken: string; groupRequireMention?: boolean }
    | { type: 'discord'; botToken: string; groupRequireMention?: boolean }
    | { type: 'whatsapp'; groupRequireMention?: boolean }
    | { type: 'wechat' }
    | { type: 'wecom'; botId: string; secret: string; groupRequireMention?: boolean }
): Record<string, unknown> {
  const groupRequireMention =
    'groupRequireMention' in channel && typeof channel.groupRequireMention === 'boolean'
      ? channel.groupRequireMention
      : true

  if (channel.type === 'telegram' || channel.type === 'discord') {
    return {
      botToken: channel.botToken,
      groupRequireMention
    }
  }

  if (channel.type === 'whatsapp') {
    return {
      groupRequireMention
    }
  }

  if (channel.type === 'wechat') {
    return {}
  }

  if (channel.type === 'wecom') {
    return {
      botId: channel.botId,
      secret: channel.secret,
      groupRequireMention
    }
  }

  return {
    appId: channel.appId,
    appSecret: channel.appSecret,
    groupRequireMention
  }
}

function mergeChannelConfig(
  existingChannel: AppChannel,
  channel:
    | { type: 'lark'; appId?: string; appSecret?: string; groupRequireMention?: boolean }
    | { type: 'telegram'; botToken?: string; groupRequireMention?: boolean }
    | { type: 'discord'; botToken?: string; groupRequireMention?: boolean }
    | { type: 'whatsapp'; groupRequireMention?: boolean }
    | { type: 'wechat' }
    | { type: 'wecom'; botId?: string; secret?: string; groupRequireMention?: boolean }
): Record<string, unknown> {
  const groupRequireMention =
    'groupRequireMention' in channel && typeof channel.groupRequireMention === 'boolean'
      ? channel.groupRequireMention
      : resolveGroupRequireMention(existingChannel.config)

  if (channel.type === 'telegram' || channel.type === 'discord') {
    return {
      botToken:
        channel.botToken ??
        (typeof existingChannel.config.botToken === 'string'
          ? existingChannel.config.botToken
          : ''),
      groupRequireMention
    }
  }

  if (channel.type === 'whatsapp') {
    return {
      ...existingChannel.config,
      groupRequireMention
    }
  }

  if (channel.type === 'wechat') {
    return existingChannel.config
  }

  if (channel.type === 'wecom') {
    return {
      botId:
        channel.botId ??
        (typeof existingChannel.config.botId === 'string' ? existingChannel.config.botId : ''),
      secret:
        channel.secret ??
        (typeof existingChannel.config.secret === 'string' ? existingChannel.config.secret : ''),
      groupRequireMention
    }
  }

  return {
    appId:
      channel.appId ??
      (typeof existingChannel.config.appId === 'string' ? existingChannel.config.appId : ''),
    appSecret:
      channel.appSecret ??
      (typeof existingChannel.config.appSecret === 'string'
        ? existingChannel.config.appSecret
        : ''),
    groupRequireMention
  }
}

async function reloadChannelServices(options: RegisterChannelsRouteOptions): Promise<void> {
  await options.channelService.reload()
}

export function registerChannelsRoute(app: Hono, options: RegisterChannelsRouteOptions): void {
  app.get('/v1/channels', async (context) => {
    return context.json(await listConfiguredChannels(options))
  })

  app.post('/v1/channels', async (context) => {
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

    const defaultAssistant = await loadBuiltInDefaultAssistant(options)
    if (!defaultAssistant) {
      return context.json({ ok: false, error: 'Default assistant is not configured' }, 409)
    }

    const createdChannel = await options.channelsRepo.create({
      type: parsed.data.type,
      name: parsed.data.name,
      assistantId: defaultAssistant.id,
      enabled: true,
      config: buildChannelConfig(parsed.data)
    })
    await reloadChannelServices(options)
    const response = await toConfiguredChannelResponse(createdChannel, options)
    if (!response) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    return context.json(response, 201)
  })

  app.post('/v1/channels/:channelId/recover', async (context) => {
    const channelId = context.req.param('channelId')
    const channel = await loadVisibleConfiguredChannelById(channelId, options)
    if (!channel) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    await options.channelSetupRecovery?.recover(channel)
    await options.channelsRepo.setLastError(channel.id, null)
    await reloadChannelServices(options)

    const refreshedChannel = await options.channelsRepo.getById(channel.id)
    if (!refreshedChannel) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    const response = await toConfiguredChannelResponse(refreshedChannel, options)
    if (!response) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    return context.json(response)
  })

  app.patch('/v1/channels/:channelId', async (context) => {
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
      await reloadChannelServices(options)
    }

    const response = await toConfiguredChannelResponse(updatedChannel, options)
    if (!response) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    return context.json(response)
  })

  app.delete('/v1/channels/:channelId', async (context) => {
    const channelId = context.req.param('channelId')
    const channel = await options.channelsRepo.getById(channelId)
    if (!channel) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }

    const shouldReloadChannelServices = Boolean(channel.assistantId)
    await options.channelsRepo.delete(channelId)
    if (shouldReloadChannelServices) {
      await reloadChannelServices(options)
    }
    return context.body(null, 204)
  })
}
