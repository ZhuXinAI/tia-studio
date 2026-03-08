import type { AppChannel } from '../persistence/repos/channels-repo'

export type ChannelType = 'lark'

export interface ChannelMessage {
  id: string
  remoteChatId: string
  senderId: string
  content: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface ChannelAdapter {
  readonly id: string
  readonly type: ChannelType
  start(): Promise<void>
  stop(): Promise<void>
  send(remoteChatId: string, message: string): Promise<void>
  onMessage?: (message: ChannelMessage) => Promise<void> | void
}

export type ChannelMessageReceivedEvent = {
  eventId: string
  channelId: string
  channelType: ChannelType
  message: ChannelMessage
}

export type ChannelMessageSendRequestedEvent = {
  eventId: string
  channelId: string
  channelType: ChannelType
  remoteChatId: string
  content: string
  metadata?: Record<string, unknown>
}

export type ChannelEventMap = {
  'channel.message.received': ChannelMessageReceivedEvent
  'channel.message.send-requested': ChannelMessageSendRequestedEvent
}

export type ChannelEventName = keyof ChannelEventMap

export type ChannelAdapterFactory = (
  channel: AppChannel
) => ChannelAdapter | Promise<ChannelAdapter>

export type ChannelAdapterFactoryRegistry = Partial<Record<ChannelType, ChannelAdapterFactory>>
