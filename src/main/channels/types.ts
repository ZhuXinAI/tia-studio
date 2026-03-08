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

export type ChannelMessageSendRequestedEvent = {
  eventId: string
  channelId: string
  channelType: string
  remoteChatId: string
  payload: ChannelOutboundPayload
}

export type ChannelTarget = Pick<
  ChannelMessageSendRequestedEvent,
  'channelId' | 'channelType' | 'remoteChatId'
>

export type ChannelEventMap = {
  'channel.message.send-requested': ChannelMessageSendRequestedEvent
}

export type ChannelEventName = keyof ChannelEventMap

export type ChannelEventHandler<TEventName extends ChannelEventName> = (
  event: ChannelEventMap[TEventName]
) => void | Promise<void>
