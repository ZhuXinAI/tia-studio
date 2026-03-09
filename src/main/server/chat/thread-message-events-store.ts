export type ThreadMessagesUpdatedSource = 'channel'

export type ThreadMessagesUpdatedEvent = {
  type: 'thread-messages-updated'
  assistantId: string
  threadId: string
  profileId: string
  source: ThreadMessagesUpdatedSource
  createdAt: string
}

type ThreadEventsState = {
  events: ThreadMessagesUpdatedEvent[]
  listeners: Set<(event: ThreadMessagesUpdatedEvent) => void>
}

const DEFAULT_MAX_BUFFERED_EVENTS = 20

function toStateKey(input: {
  assistantId: string
  profileId: string
}): string {
  return `${input.assistantId}:${input.profileId}`
}

export class ThreadMessageEventsStore {
  private readonly states = new Map<string, ThreadEventsState>()

  constructor(private readonly maxBufferedEvents = DEFAULT_MAX_BUFFERED_EVENTS) {}

  appendMessagesUpdated(input: {
    assistantId: string
    threadId: string
    profileId: string
    source?: ThreadMessagesUpdatedSource
  }): ThreadMessagesUpdatedEvent {
    const state = this.getOrCreateState({
      assistantId: input.assistantId,
      profileId: input.profileId
    })

    const event: ThreadMessagesUpdatedEvent = {
      type: 'thread-messages-updated',
      assistantId: input.assistantId,
      threadId: input.threadId,
      profileId: input.profileId,
      source: input.source ?? 'channel',
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

  createAssistantStream(input: {
    assistantId: string
    profileId: string
  }): ReadableStream<string> {
    const state = this.getOrCreateState(input)
    let listener: ((event: ThreadMessagesUpdatedEvent) => void) | null = null

    return new ReadableStream<string>({
      start: (controller) => {
        const writeEvent = (event: ThreadMessagesUpdatedEvent): void => {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        }

        for (const event of state.events) {
          writeEvent(event)
        }

        listener = (event: ThreadMessagesUpdatedEvent): void => {
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
    assistantId: string
    profileId: string
  }): ThreadEventsState {
    const key = toStateKey(input)
    const existing = this.states.get(key)
    if (existing) {
      return existing
    }

    const nextState: ThreadEventsState = {
      events: [],
      listeners: new Set()
    }
    this.states.set(key, nextState)
    return nextState
  }
}
