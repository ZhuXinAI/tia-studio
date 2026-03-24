import type { AppChannel } from '../persistence/repos/channels-repo'

export type ChannelType =
  | 'discord'
  | 'lark'
  | 'telegram'
  | 'whatsapp'
  | 'wechat'
  | 'wecom'
  | 'wechat-kf'

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
  sendImage?(remoteChatId: string, filePath: string): Promise<void>
  sendFile?(remoteChatId: string, filePath: string, fileName: string): Promise<void>
  acknowledgeMessage?(messageId: string): Promise<void>
  onMessage?: (message: ChannelMessage) => Promise<void> | void
}

export type ChannelTextOutboundPayload = {
  type: 'text'
  text: string
}

export type ChannelImageOutboundPayload = {
  type: 'image'
  filePath: string
}

export type ChannelFileOutboundPayload = {
  type: 'file'
  filePath: string
  fileName: string
}

export type ChannelOutboundPayload =
  | ChannelTextOutboundPayload
  | ChannelImageOutboundPayload
  | ChannelFileOutboundPayload

export type ChannelMessageReceivedEvent = {
  eventId: string
  channelId: string
  channelType: ChannelType
  message: ChannelMessage
}

export type ChannelMessageSendRequestedEvent = {
  eventId: string
  channelId: string
  channelType: ChannelType | string
  remoteChatId: string
  content?: string
  payload?: ChannelOutboundPayload
  metadata?: Record<string, unknown>
}

export type ChannelTarget = Pick<
  ChannelMessageSendRequestedEvent,
  'channelId' | 'channelType' | 'remoteChatId'
>

export type ChannelEventMap = {
  'channel.message.received': ChannelMessageReceivedEvent
  'channel.message.send-requested': ChannelMessageSendRequestedEvent
}

export type ChannelEventName = keyof ChannelEventMap

export type ChannelEventHandler<TEventName extends ChannelEventName> = (
  event: ChannelEventMap[TEventName]
) => void | Promise<void>

export type ChannelAdapterFactory = (
  channel: AppChannel
) => ChannelAdapter | Promise<ChannelAdapter>

export type ChannelAdapterFactoryRegistry = Partial<Record<ChannelType, ChannelAdapterFactory>>
