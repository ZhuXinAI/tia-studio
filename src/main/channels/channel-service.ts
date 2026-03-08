import { randomUUID } from 'node:crypto'
import type { AppChannel } from '../persistence/repos/channels-repo'
import { ChannelEventBus } from './channel-event-bus'
import { LarkChannel } from './lark-channel'
import type {
  ChannelAdapter,
  ChannelAdapterFactoryRegistry,
  ChannelMessageSendRequestedEvent,
  ChannelType
} from './types'

type ChannelsRepositoryLike = {
  listRuntimeEnabled(): Promise<AppChannel[]>
}

type ChannelServiceOptions = {
  channelsRepo: ChannelsRepositoryLike
  eventBus: ChannelEventBus
  adapterFactories?: ChannelAdapterFactoryRegistry
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

    for (const channel of channels) {
      await this.registerChannel(channel)
    }
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
    const adapter = await this.buildAdapter(channel)
    if (!adapter) {
      return
    }

    adapter.onMessage = async (message) => {
      await this.options.eventBus.publish('channel.message.received', {
        eventId: randomUUID(),
        channelId: channel.id,
        channelType: adapter.type,
        message
      })
    }

    this.adapters.set(channel.id, adapter)
    await adapter.start()
  }

  private async handleSendRequested(event: ChannelMessageSendRequestedEvent): Promise<void> {
    const adapter = this.adapters.get(event.channelId)
    if (!adapter) {
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
        appSecret: this.getRequiredConfigString(channel, 'appSecret')
      })
    }

    return null
  }

  private getRequiredConfigString(channel: AppChannel, key: string): string {
    const value = channel.config[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }

    throw new Error(`Channel ${channel.id} is missing required config: ${key}`)
  }
}
