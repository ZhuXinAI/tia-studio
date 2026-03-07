export type TeamRunStatusEventType =
  | 'run-started'
  | 'delegation-started'
  | 'delegation-finished'
  | 'iteration-complete'
  | 'run-finished'
  | 'run-failed'

export type TeamRunStatusEvent = {
  type: TeamRunStatusEventType
  runId: string
  threadId: string
  createdAt: string
  data?: Record<string, unknown>
}

type TeamRunState = {
  threadId: string
  events: TeamRunStatusEvent[]
  listeners: Set<(event: TeamRunStatusEvent) => void>
  closed: boolean
}

export class TeamRunStatusStore {
  private readonly runs = new Map<string, TeamRunState>()

  startRun(input: { runId: string; threadId: string }): TeamRunStatusEvent {
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
      type: TeamRunStatusEventType
      data?: Record<string, unknown>
    }
  ): TeamRunStatusEvent {
    const state = this.runs.get(runId)
    if (!state) {
      throw new Error(`Unknown team run: ${runId}`)
    }

    const event: TeamRunStatusEvent = {
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

  finishRun(runId: string, data?: Record<string, unknown>): TeamRunStatusEvent {
    return this.append(runId, {
      type: 'run-finished',
      ...(data ? { data } : {})
    })
  }

  failRun(runId: string, error: string): TeamRunStatusEvent {
    return this.append(runId, {
      type: 'run-failed',
      data: { error }
    })
  }

  getEvents(runId: string): TeamRunStatusEvent[] {
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
        const writeEvent = (event: TeamRunStatusEvent): void => {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        }

        for (const event of state.events) {
          writeEvent(event)
        }

        if (state.closed) {
          controller.close()
          return
        }

        const listener = (event: TeamRunStatusEvent): void => {
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
