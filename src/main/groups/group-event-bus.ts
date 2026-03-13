import type { GroupEventHandler, GroupEventMap, GroupEventName } from './types'

export class GroupEventBus {
  private readonly handlers = new Map<GroupEventName, Set<GroupEventHandler<GroupEventName>>>()

  subscribe<TEventName extends GroupEventName>(
    eventName: TEventName,
    handler: GroupEventHandler<TEventName>
  ): () => void {
    const nextHandlers = this.handlers.get(eventName) ?? new Set()
    nextHandlers.add(handler as GroupEventHandler<GroupEventName>)
    this.handlers.set(eventName, nextHandlers)

    return () => {
      const currentHandlers = this.handlers.get(eventName)
      if (!currentHandlers) {
        return
      }

      currentHandlers.delete(handler as GroupEventHandler<GroupEventName>)
      if (currentHandlers.size === 0) {
        this.handlers.delete(eventName)
      }
    }
  }

  async publish<TEventName extends GroupEventName>(
    eventName: TEventName,
    event: GroupEventMap[TEventName]
  ): Promise<void> {
    const handlers = [...(this.handlers.get(eventName) ?? [])]

    for (const handler of handlers) {
      await handler(event)
    }
  }
}
