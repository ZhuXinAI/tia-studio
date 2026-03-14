import { randomUUID } from 'node:crypto'
import type { AppChannel } from '../persistence/repos/channels-repo'
import { ChannelEventBus } from './channel-event-bus'
import { resolveGroupRequireMention } from './channel-config'
import { LarkChannel } from './lark-channel'
import { WechatKfChannel } from './wechat-kf-channel'
import { WeComChannel } from './wecom-channel'
import type {
  ChannelAdapter,
  ChannelAdapterFactoryRegistry,
  ChannelMessageSendRequestedEvent,
  ChannelType
} from './types'
import { logger } from '../utils/logger'

const DEFAULT_CHANNEL_START_TIMEOUT_MS = 8000

type ChannelsRepositoryLike = {
  listRuntimeEnabled(): Promise<AppChannel[]>
  setLastError(id: string, message: string | null): Promise<unknown>
}

type ChannelServiceOptions = {
  channelsRepo: ChannelsRepositoryLike
  eventBus: ChannelEventBus
  adapterFactories?: ChannelAdapterFactoryRegistry
  startTimeoutMs?: number
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return typeof error === 'string' ? error : 'Unknown error'
}

export class ChannelService {
  private readonly adapters = new Map<string, ChannelAdapter>()
  private unsubscribeSendRequested: (() => void) | null = null

  constructor(private readonly options: ChannelServiceOptions) {}

  async start(): Promise<void> {
    if (this.unsubscribeSendRequested) {
      return
    }

    this.unsubscribeSendRequested = this.options.eventBus.subscribe(
      'channel.message.send-requested',
      async (event) => {
        await this.handleSendRequested(event)
      }
    )

    const channels = await this.options.channelsRepo.listRuntimeEnabled()

    await Promise.all(channels.map(async (channel) => this.registerChannel(channel)))
  }

  async reload(): Promise<void> {
    await this.stop()
    await this.start()
  }

  async stop(): Promise<void> {
    if (this.unsubscribeSendRequested) {
      this.unsubscribeSendRequested()
      this.unsubscribeSendRequested = null
    }

    const adapters = [...this.adapters.values()]
    this.adapters.clear()

    for (const adapter of adapters) {
      adapter.onMessage = undefined
      await adapter.stop()
    }
  }

  private async registerChannel(channel: AppChannel): Promise<void> {
    let adapter: ChannelAdapter | null = null

    try {
      adapter = await this.buildAdapter(channel)
      if (!adapter) {
        await this.recordLastError(channel.id, `Unsupported channel type: ${channel.type}`)
        return
      }

      const activeAdapter = adapter
      activeAdapter.onMessage = async (message) => {
        await this.options.eventBus.publish('channel.message.received', {
          eventId: randomUUID(),
          channelId: channel.id,
          channelType: activeAdapter.type,
          message
        })
      }

      await this.startAdapter(activeAdapter)
      this.adapters.set(channel.id, activeAdapter)
      await this.recordLastError(channel.id, null)
    } catch (error) {
      if (adapter) {
        adapter.onMessage = undefined
        void adapter.stop().catch(() => undefined)
      }

      await this.recordLastError(channel.id, toErrorMessage(error))
    }
  }

  private async handleSendRequested(event: ChannelMessageSendRequestedEvent): Promise<void> {
    const adapter = this.adapters.get(event.channelId)
    if (!adapter) {
      return
    }

    if (event.payload?.type === 'image') {
      if (typeof adapter.sendImage !== 'function') {
        throw new Error(`Channel type "${adapter.type}" does not support image messages.`)
      }

      await adapter.sendImage(event.remoteChatId, event.payload.filePath)
      return
    }

    if (event.payload?.type === 'file') {
      if (typeof adapter.sendFile !== 'function') {
        throw new Error(`Channel type "${adapter.type}" does not support file messages.`)
      }

      await adapter.sendFile(event.remoteChatId, event.payload.filePath, event.payload.fileName)
      return
    }

    const content =
      typeof event.content === 'string'
        ? event.content
        : event.payload?.type === 'text'
          ? event.payload.text
          : null

    if (!content || content.trim().length === 0) {
      return
    }

    await adapter.send(event.remoteChatId, content)
  }

  private async buildAdapter(channel: AppChannel): Promise<ChannelAdapter | null> {
    const customFactory = this.options.adapterFactories?.[channel.type as ChannelType]
    if (customFactory) {
      return customFactory(channel)
    }

    if (channel.type === 'lark') {
      return new LarkChannel({
        id: channel.id,
        appId: this.getRequiredConfigString(channel, 'appId'),
        appSecret: this.getRequiredConfigString(channel, 'appSecret'),
        groupRequireMention: this.getConfigBoolean(channel, 'groupRequireMention')
      })
    }

    if (channel.type === 'wecom') {
      return new WeComChannel({
        id: channel.id,
        botId: this.getRequiredConfigString(channel, 'botId'),
        secret: this.getRequiredConfigString(channel, 'secret'),
        groupRequireMention: this.getConfigBoolean(channel, 'groupRequireMention')
      })
    }

    if (channel.type === 'wechat-kf') {
      return new WechatKfChannel({
        id: channel.id,
        serverUrl: this.getRequiredConfigString(channel, 'serverUrl'),
        serverKey: this.getRequiredConfigString(channel, 'serverKey')
      })
    }

    return null
  }

  private async startAdapter(adapter: ChannelAdapter): Promise<void> {
    const timeoutMs = this.options.startTimeoutMs ?? DEFAULT_CHANNEL_START_TIMEOUT_MS

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    try {
      await Promise.race([
        adapter.start(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Channel startup timed out after ${timeoutMs}ms.`))
          }, timeoutMs)
        })
      ])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  private async recordLastError(channelId: string, message: string | null): Promise<void> {
    try {
      await this.options.channelsRepo.setLastError(channelId, message)
    } catch (error) {
      logger.error(`Failed to update channel health for ${channelId}:`, error)
    }
  }

  private getRequiredConfigString(channel: AppChannel, key: string): string {
    const value = channel.config[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }

    throw new Error(`Channel ${channel.id} is missing required config: ${key}`)
  }

  private getConfigBoolean(channel: AppChannel, key: string): boolean {
    if (key === 'groupRequireMention') {
      return resolveGroupRequireMention(channel.config)
    }

    const value = channel.config[key]
    return typeof value === 'boolean' ? value : false
  }
}
