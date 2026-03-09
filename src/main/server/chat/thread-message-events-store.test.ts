import { describe, expect, it } from 'vitest'
import { ThreadMessageEventsStore } from './thread-message-events-store'

describe('ThreadMessageEventsStore', () => {
  it('streams appended events for the matching assistant profile', async () => {
    const store = new ThreadMessageEventsStore()
    const stream = store.createAssistantStream({
      assistantId: 'assistant-1',
      profileId: 'default-profile'
    })

    const reader = stream.getReader()

    store.appendMessagesUpdated({
      assistantId: 'assistant-1',
      threadId: 'thread-1',
      profileId: 'default-profile'
    })

    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(first.value).toContain('"type":"thread-messages-updated"')
    expect(first.value).toContain('"threadId":"thread-1"')

    await reader.cancel()
  })

  it('replays buffered events for a newly opened stream', async () => {
    const store = new ThreadMessageEventsStore()

    store.appendMessagesUpdated({
      assistantId: 'assistant-1',
      threadId: 'thread-1',
      profileId: 'default-profile'
    })

    const stream = store.createAssistantStream({
      assistantId: 'assistant-1',
      profileId: 'default-profile'
    })
    const reader = stream.getReader()

    const replayed = await reader.read()
    expect(replayed.done).toBe(false)
    expect(replayed.value).toContain('"assistantId":"assistant-1"')

    await reader.cancel()
  })
})
