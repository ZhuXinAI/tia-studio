export type GroupThreadMessageCreatedEvent = {
  type: 'group-thread-message-created'
  threadId: string
  profileId: string
  messageId: string
  createdAt: string
}

type GroupThreadEventsState = {
  events: GroupThreadMessageCreatedEvent[]
  listeners: Set<(event: GroupThreadMessageCreatedEvent) => void>
}

const DEFAULT_MAX_BUFFERED_EVENTS = 20

function toStateKey(input: { threadId: string; profileId: string }): string {
  return `${input.threadId}:${input.profileId}`
}

export class GroupThreadEventsStore {
  private readonly states = new Map<string, GroupThreadEventsState>()

  constructor(private readonly maxBufferedEvents = DEFAULT_MAX_BUFFERED_EVENTS) {}

  appendMessageCreated(input: {
    threadId: string
    profileId: string
    messageId: string
  }): GroupThreadMessageCreatedEvent {
    const state = this.getOrCreateState({
      threadId: input.threadId,
      profileId: input.profileId
    })

    const event: GroupThreadMessageCreatedEvent = {
      type: 'group-thread-message-created',
      threadId: input.threadId,
      profileId: input.profileId,
      messageId: input.messageId,
      createdAt: new Date().toISOString()
    }

    state.events.push(event)
    if (state.events.length > this.maxBufferedEvents) {
      state.events.splice(0, state.events.length - this.maxBufferedEvents)
    }

    for (const listener of state.listeners) {
      listener(event)
    }

    return event
  }

  createThreadStream(input: { threadId: string; profileId: string }): ReadableStream<string> {
    const state = this.getOrCreateState(input)
    let listener: ((event: GroupThreadMessageCreatedEvent) => void) | null = null

    return new ReadableStream<string>({
      start: (controller) => {
        const writeEvent = (event: GroupThreadMessageCreatedEvent): void => {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        }

        for (const event of state.events) {
          writeEvent(event)
        }

        listener = (event: GroupThreadMessageCreatedEvent): void => {
          writeEvent(event)
        }

        state.listeners.add(listener)
      },
      cancel: () => {
        if (listener) {
          state.listeners.delete(listener)
          listener = null
        }
      }
    })
  }

  private getOrCreateState(input: {
    threadId: string
    profileId: string
  }): GroupThreadEventsState {
    const key = toStateKey(input)
    const existing = this.states.get(key)
    if (existing) {
      return existing
    }

    const nextState: GroupThreadEventsState = {
      events: [],
      listeners: new Set()
    }
    this.states.set(key, nextState)
    return nextState
  }
}
