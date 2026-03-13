export type GroupRunStatusEventType =
  | 'run-started'
  | 'speaker-selected'
  | 'turn-started'
  | 'message-posted'
  | 'turn-passed'
  | 'run-finished'
  | 'run-failed'

export type GroupRunStatusEvent = {
  type: GroupRunStatusEventType
  runId: string
  threadId: string
  createdAt: string
  data?: Record<string, unknown>
}

type GroupRunState = {
  threadId: string
  events: GroupRunStatusEvent[]
  listeners: Set<(event: GroupRunStatusEvent) => void>
  closed: boolean
}

export class GroupRunStatusStore {
  private readonly runs = new Map<string, GroupRunState>()

  startRun(input: { runId: string; threadId: string }): GroupRunStatusEvent {
    this.runs.set(input.runId, {
      threadId: input.threadId,
      events: [],
      listeners: new Set(),
      closed: false
    })

    return this.append(input.runId, {
      type: 'run-started'
    })
  }

  append(
    runId: string,
    input: {
      type: GroupRunStatusEventType
      data?: Record<string, unknown>
    }
  ): GroupRunStatusEvent {
    const state = this.runs.get(runId)
    if (!state) {
      throw new Error(`Unknown group run: ${runId}`)
    }

    const event: GroupRunStatusEvent = {
      type: input.type,
      runId,
      threadId: state.threadId,
      createdAt: new Date().toISOString(),
      ...(input.data ? { data: input.data } : {})
    }

    state.events.push(event)

    if (input.type === 'run-finished' || input.type === 'run-failed') {
      state.closed = true
    }

    for (const listener of state.listeners) {
      listener(event)
    }

    return event
  }

  finishRun(runId: string, data?: Record<string, unknown>): GroupRunStatusEvent {
    return this.append(runId, {
      type: 'run-finished',
      ...(data ? { data } : {})
    })
  }

  failRun(runId: string, error: string): GroupRunStatusEvent {
    return this.append(runId, {
      type: 'run-failed',
      data: { error }
    })
  }

  getEvents(runId: string): GroupRunStatusEvent[] {
    const state = this.runs.get(runId)
    return state ? [...state.events] : []
  }

  createStatusStream(runId: string, threadId: string): ReadableStream<string> | null {
    const state = this.runs.get(runId)
    if (!state || state.threadId !== threadId) {
      return null
    }

    return new ReadableStream<string>({
      start: (controller) => {
        const writeEvent = (event: GroupRunStatusEvent): void => {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        }

        for (const event of state.events) {
          writeEvent(event)
        }

        if (state.closed) {
          controller.close()
          return
        }

        const listener = (event: GroupRunStatusEvent): void => {
          writeEvent(event)
          if (event.type === 'run-finished' || event.type === 'run-failed') {
            state.listeners.delete(listener)
            controller.close()
          }
        }

        state.listeners.add(listener)
      }
    })
  }
}
