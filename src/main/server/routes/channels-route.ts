import type { Hono } from 'hono'
import type { WhatsAppAuthStateStore } from '../../channels/whatsapp-auth-state-store'
import type { WechatAuthStateStore } from '../../channels/wechat-auth-state-store'
import { resolveGroupRequireMention } from '../../channels/channel-config'
import type { ChannelPairingsRepository } from '../../persistence/repos/channel-pairings-repo'
import type { AppChannel, ChannelsRepository } from '../../persistence/repos/channels-repo'
import type { WorkspacesRepository } from '../../persistence/repos/workspaces-repo'
import {
  createConfiguredChannelSchema,
  updateConfiguredChannelSchema
} from '../validators/channels-validator'

type Options = {
  channelsRepo: ChannelsRepository
  pairingsRepo: Pick<
    ChannelPairingsRepository,
    'countByChannelIdAndStatus' | 'countActivePendingByChannelId'
  >
  channelService: { reload(): Promise<void> }
  channelSetupRecovery?: { recover(channel: Pick<AppChannel, 'id' | 'type'>): Promise<void> }
  whatsAppAuthStateStore?: Pick<WhatsAppAuthStateStore, 'get'>
  wechatAuthStateStore?: Pick<WechatAuthStateStore, 'get'>
  workspacesRepo?: Pick<WorkspacesRepository, 'getById'>
}

function buildConfig(channel: Record<string, unknown> & { type: string }): Record<string, unknown> {
  const groupRequireMention =
    typeof channel.groupRequireMention === 'boolean' ? channel.groupRequireMention : true
  if (channel.type === 'telegram' || channel.type === 'discord')
    return { botToken: channel.botToken, groupRequireMention }
  if (channel.type === 'whatsapp') return { groupRequireMention }
  if (channel.type === 'wechat') return {}
  if (channel.type === 'wecom')
    return { botId: channel.botId, secret: channel.secret, groupRequireMention }
  return { appId: channel.appId, appSecret: channel.appSecret, groupRequireMention }
}

function mergeConfig(existing: AppChannel, input: Record<string, unknown> & { type: string }) {
  return {
    ...existing.config,
    ...buildConfig({ ...existing.config, ...input }),
    groupRequireMention:
      typeof input.groupRequireMention === 'boolean'
        ? input.groupRequireMention
        : resolveGroupRequireMention(existing.config)
  }
}

function authState(channel: AppChannel, options: Options) {
  const state =
    channel.type === 'whatsapp'
      ? options.whatsAppAuthStateStore?.get(channel.id)
      : channel.type === 'wechat'
        ? options.wechatAuthStateStore?.get(channel.id)
        : null
  if (!state) return null
  return {
    status: state.status,
    qrCodeDataUrl: state.qrCodeDataUrl,
    qrCodeValue: state.qrCodeValue,
    accountLabel: 'phoneNumber' in state ? state.phoneNumber : state.accountId,
    errorMessage: state.errorMessage,
    updatedAt: state.updatedAt
  }
}

function hasConfig(channel: AppChannel): boolean {
  if (channel.type === 'whatsapp' || channel.type === 'wechat') return true
  if (channel.type === 'telegram' || channel.type === 'discord')
    return Boolean(String(channel.config.botToken ?? '').trim())
  if (channel.type === 'wecom')
    return Boolean(
      String(channel.config.botId ?? '').trim() && String(channel.config.secret ?? '').trim()
    )
  return Boolean(
    String(channel.config.appId ?? '').trim() && String(channel.config.appSecret ?? '').trim()
  )
}

async function response(channel: AppChannel, options: Options) {
  const state = authState(channel, options)
  const needsAuth = channel.type === 'whatsapp' || channel.type === 'wechat'
  const status =
    channel.lastError || state?.status === 'error'
      ? 'error'
      : channel.enabled && hasConfig(channel) && (!needsAuth || state?.status === 'connected')
        ? 'connected'
        : 'disconnected'
  const now = new Date().toISOString()
  const supportsPairing = channel.type === 'telegram' || channel.type === 'whatsapp'
  const [pairedCount, pendingPairingCount] = supportsPairing
    ? await Promise.all([
        options.pairingsRepo.countByChannelIdAndStatus(channel.id, 'approved'),
        options.pairingsRepo.countActivePendingByChannelId(channel.id, now)
      ])
    : [0, 0]
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    workspaceId: channel.workspaceId,
    groupRequireMention: resolveGroupRequireMention(channel.config),
    status,
    errorMessage: channel.lastError,
    pairedCount,
    pendingPairingCount,
    authState: state
  }
}

async function resolveWorkspaceBinding(
  workspaceId: string | null | undefined,
  options: Options
): Promise<string | null> {
  if (!workspaceId) return null
  const workspace = await options.workspacesRepo?.getById(workspaceId)
  if (!workspace || workspace.isMissing || workspace.builtInKind === 'chats') {
    throw new Error('Workspace is unavailable for channel routing')
  }
  return workspace.id
}

export function registerChannelsRoute(app: Hono, options: Options): void {
  app.get('/v1/channels', async (context) =>
    context.json(
      await Promise.all(
        (await options.channelsRepo.list()).map((channel) => response(channel, options))
      )
    )
  )
  app.post('/v1/channels', async (context) => {
    const parsed = createConfiguredChannelSchema.safeParse(
      await context.req.json().catch(() => null)
    )
    if (!parsed.success)
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    let workspaceId: string | null
    try {
      workspaceId = await resolveWorkspaceBinding(parsed.data.workspaceId, options)
    } catch (error) {
      return context.json(
        { ok: false, error: error instanceof Error ? error.message : 'Invalid workspace' },
        400
      )
    }
    const created = await options.channelsRepo.create({
      type: parsed.data.type,
      name: parsed.data.name,
      enabled: true,
      workspaceId,
      config: buildConfig(parsed.data)
    })
    await options.channelService.reload()
    return context.json(await response(created, options), 201)
  })
  app.post('/v1/channels/:channelId/recover', async (context) => {
    const channel = await options.channelsRepo.getById(context.req.param('channelId'))
    if (!channel) return context.json({ ok: false, error: 'Channel not found' }, 404)
    await options.channelSetupRecovery?.recover(channel)
    const updated = await options.channelsRepo.setLastError(channel.id, null)
    await options.channelService.reload()
    return context.json(await response(updated ?? channel, options))
  })
  app.patch('/v1/channels/:channelId', async (context) => {
    const parsed = updateConfiguredChannelSchema.safeParse(
      await context.req.json().catch(() => null)
    )
    if (!parsed.success)
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    const existing = await options.channelsRepo.getById(context.req.param('channelId'))
    if (!existing) return context.json({ ok: false, error: 'Channel not found' }, 404)
    if (existing.type !== parsed.data.type)
      return context.json({ ok: false, error: 'Channel type cannot be changed' }, 400)
    let workspaceId: string | null | undefined
    try {
      workspaceId =
        parsed.data.workspaceId === undefined
          ? undefined
          : await resolveWorkspaceBinding(parsed.data.workspaceId, options)
    } catch (error) {
      return context.json(
        { ok: false, error: error instanceof Error ? error.message : 'Invalid workspace' },
        400
      )
    }
    const updated = await options.channelsRepo.update(existing.id, {
      name: parsed.data.name,
      ...(workspaceId === undefined ? {} : { workspaceId }),
      config: mergeConfig(existing, parsed.data)
    })
    await options.channelService.reload()
    return context.json(await response(updated ?? existing, options))
  })
  app.delete('/v1/channels/:channelId', async (context) => {
    if (!(await options.channelsRepo.delete(context.req.param('channelId')))) {
      return context.json({ ok: false, error: 'Channel not found' }, 404)
    }
    await options.channelService.reload()
    return context.body(null, 204)
  })
}
