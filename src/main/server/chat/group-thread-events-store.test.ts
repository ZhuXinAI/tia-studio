import { describe, expect, it } from 'vitest'
import { GroupThreadEventsStore } from './group-thread-events-store'

describe('GroupThreadEventsStore', () => {
  it('streams appended events for the matching thread profile', async () => {
    const store = new GroupThreadEventsStore()
    const stream = store.createThreadStream({
      threadId: 'group-thread-1',
      profileId: 'default-profile'
    })

    const reader = stream.getReader()

    store.appendMessageCreated({
      threadId: 'group-thread-1',
      profileId: 'default-profile',
      messageId: 'msg-1'
    })

    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(first.value).toContain('"type":"group-thread-message-created"')
    expect(first.value).toContain('"messageId":"msg-1"')

    await reader.cancel()
  })

  it('replays buffered group thread events to new SSE listeners', async () => {
    const store = new GroupThreadEventsStore()
    store.appendMessageCreated({
      threadId: 'group-thread-1',
      profileId: 'default-profile',
      messageId: 'msg-1'
    })

    const stream = store.createThreadStream({
      threadId: 'group-thread-1',
      profileId: 'default-profile'
    })
    const reader = stream.getReader()

    const replayed = await reader.read()
    expect(replayed.done).toBe(false)
    expect(replayed.value).toContain('"threadId":"group-thread-1"')

    await reader.cancel()
  })
})
