import { describe, expect, it } from 'vitest'
import { resolveVisibleThreads } from './thread-page-helpers'
import type { ThreadRecord } from './threads-query'

function createThread(overrides?: Partial<ThreadRecord>): ThreadRecord {
  return {
    id: 'thread-1',
    assistantId: 'assistant-1',
    resourceId: 'default-profile',
    title: 'Sprint planning',
    lastMessageAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  }
}

describe('resolveVisibleThreads', () => {
  it('reuses the current empty thread list when no assistant is selected', () => {
    const currentThreads: ThreadRecord[] = []

    const nextThreads = resolveVisibleThreads({
      currentThreads,
      selectedAssistantId: null,
      threads: []
    })

    expect(nextThreads).toBe(currentThreads)
  })

  it('reuses the current list when the selected assistant thread list is unchanged', () => {
    const currentThreads = [
      createThread({ id: 'thread-2', lastMessageAt: '2026-03-02T00:00:00.000Z' }),
      createThread({ id: 'thread-1', lastMessageAt: '2026-03-01T00:00:00.000Z' })
    ]

    const nextThreads = resolveVisibleThreads({
      currentThreads,
      selectedAssistantId: 'assistant-1',
      threads: [
        createThread({ id: 'thread-1', lastMessageAt: '2026-03-01T00:00:00.000Z' }),
        createThread({ id: 'thread-2', lastMessageAt: '2026-03-02T00:00:00.000Z' })
      ]
    })

    expect(nextThreads).toBe(currentThreads)
  })
})
