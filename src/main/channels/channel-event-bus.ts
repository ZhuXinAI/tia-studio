import type { ChannelEventHandler, ChannelEventMap, ChannelEventName } from './types'

export class ChannelEventBus {
  private readonly handlers = new Map<ChannelEventName, Set<ChannelEventHandler<ChannelEventName>>>()

  subscribe<TEventName extends ChannelEventName>(
    eventName: TEventName,
    handler: ChannelEventHandler<TEventName>
  ): () => void {
    const nextHandlers = this.handlers.get(eventName) ?? new Set()
    nextHandlers.add(handler as ChannelEventHandler<ChannelEventName>)
    this.handlers.set(eventName, nextHandlers)

    return () => {
      const currentHandlers = this.handlers.get(eventName)
      if (!currentHandlers) {
        return
      }

      currentHandlers.delete(handler as ChannelEventHandler<ChannelEventName>)
      if (currentHandlers.size === 0) {
        this.handlers.delete(eventName)
      }
    }
  }

  async publish<TEventName extends ChannelEventName>(
    eventName: TEventName,
    event: ChannelEventMap[TEventName]
  ): Promise<void> {
    const handlers = [...(this.handlers.get(eventName) ?? [])]

    for (const handler of handlers) {
      await handler(event)
    }
  }
}
