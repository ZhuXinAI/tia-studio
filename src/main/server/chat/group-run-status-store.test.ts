import { describe, expect, it } from 'vitest'
import { GroupRunStatusStore } from './group-run-status-store'

describe('GroupRunStatusStore', () => {
  it('replays buffered run events and closes after completion', async () => {
    const store = new GroupRunStatusStore()

    store.startRun({
      runId: 'run-1',
      threadId: 'group-thread-1'
    })
    store.append('run-1', {
      type: 'speaker-selected',
      data: { assistantId: 'assistant-1' }
    })
    store.finishRun('run-1')

    const stream = store.createStatusStream('run-1', 'group-thread-1')
    expect(stream).toBeTruthy()

    const reader = stream?.getReader()
    const first = await reader?.read()
    const second = await reader?.read()
    const third = await reader?.read()
    const done = await reader?.read()

    expect(first?.value).toContain('"type":"run-started"')
    expect(second?.value).toContain('"type":"speaker-selected"')
    expect(third?.value).toContain('"type":"run-finished"')
    expect(done?.done).toBe(true)
  })

  it('returns null for unknown runs', () => {
    const store = new GroupRunStatusStore()

    expect(store.createStatusStream('missing-run', 'group-thread-1')).toBeNull()
  })
})
