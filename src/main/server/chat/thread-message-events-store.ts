export type ThreadMessagesUpdatedSource = 'channel' | 'command'

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

function toAssistantStateKey(input: { assistantId: string; profileId: string }): string {
  return `assistant:${input.assistantId}:${input.profileId}`
}

function toProfileStateKey(input: { profileId: string }): string {
  return `profile:${input.profileId}`
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
    const event: ThreadMessagesUpdatedEvent = {
      type: 'thread-messages-updated',
      assistantId: input.assistantId,
      threadId: input.threadId,
      profileId: input.profileId,
      source: input.source ?? 'channel',
      createdAt: new Date().toISOString()
    }

    this.appendToState(this.getOrCreateAssistantState(input), event)
    this.appendToState(this.getOrCreateProfileState(input), event)

    return event
  }

  createAssistantStream(input: { assistantId: string; profileId: string }): ReadableStream<string> {
    return this.createStream(this.getOrCreateAssistantState(input))
  }

  createProfileStream(input: { profileId: string }): ReadableStream<string> {
    return this.createStream(this.getOrCreateProfileState(input))
  }

  private appendToState(state: ThreadEventsState, event: ThreadMessagesUpdatedEvent): void {
    state.events.push(event)
    if (state.events.length > this.maxBufferedEvents) {
      state.events.splice(0, state.events.length - this.maxBufferedEvents)
    }

    for (const listener of state.listeners) {
      listener(event)
    }
  }

  private createStream(state: ThreadEventsState): ReadableStream<string> {
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

  private getOrCreateAssistantState(input: {
    assistantId: string
    profileId: string
  }): ThreadEventsState {
    return this.getOrCreateState(toAssistantStateKey(input))
  }

  private getOrCreateProfileState(input: { profileId: string }): ThreadEventsState {
    return this.getOrCreateState(toProfileStateKey(input))
  }

  private getOrCreateState(key: string): ThreadEventsState {
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
