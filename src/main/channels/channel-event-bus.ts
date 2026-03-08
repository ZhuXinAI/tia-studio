import type { ChannelEventMap, ChannelEventName } from './types'

type ChannelEventHandler<EventName extends ChannelEventName> = (
  payload: ChannelEventMap[EventName]
) => Promise<void> | void

export class ChannelEventBus {
  private readonly handlers: {
    [EventName in ChannelEventName]: Set<ChannelEventHandler<EventName>>
  } = {
    'channel.message.received': new Set(),
    'channel.message.send-requested': new Set()
  }

  subscribe<EventName extends ChannelEventName>(
    eventName: EventName,
    handler: ChannelEventHandler<EventName>
  ): () => void {
    const handlers = this.handlers[eventName] as Set<ChannelEventHandler<EventName>>
    handlers.add(handler)

    return () => {
      handlers.delete(handler)
    }
  }

  async publish<EventName extends ChannelEventName>(
    eventName: EventName,
    payload: ChannelEventMap[EventName]
  ): Promise<void> {
    const handlers = [...(this.handlers[eventName] as Set<ChannelEventHandler<EventName>>)]

    for (const handler of handlers) {
      await handler(payload)
    }
  }
}
