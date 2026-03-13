import { describe, expect, it, vi } from 'vitest'
import { GroupEventBus } from './group-event-bus'

describe('GroupEventBus', () => {
  it('publishes and subscribes to group events in order', async () => {
    const bus = new GroupEventBus()
    const seen: string[] = []

    const unsubscribe = bus.subscribe('group.message.requested', async (event) => {
      seen.push(event.content)
    })

    await bus.publish('group.message.requested', {
      eventId: 'evt-1',
      runId: 'run-1',
      groupThreadId: 'group-thread-1',
      assistantId: 'assistant-1',
      content: 'I can take that',
      mentions: ['assistant-2']
    })

    unsubscribe()
    expect(seen).toEqual(['I can take that'])
  })

  it('stops notifying a handler after unsubscribe', async () => {
    const bus = new GroupEventBus()
    const handler = vi.fn()

    const unsubscribe = bus.subscribe('group.turn.passed', handler)
    unsubscribe()

    await bus.publish('group.turn.passed', {
      eventId: 'evt-2',
      runId: 'run-1',
      groupThreadId: 'group-thread-1',
      assistantId: 'assistant-1',
      reason: 'No action needed'
    })

    expect(handler).not.toHaveBeenCalled()
  })
})
