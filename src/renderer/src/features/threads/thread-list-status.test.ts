import { describe, expect, it } from 'vitest'
import type { AgentSessionSnapshot } from '../../../../shared/agent-runtime'
import {
  getThreadListStatus,
  getUnreadCompletionThreadIds,
  isThreadGenerating
} from './thread-list-status'

const thread: AgentSessionSnapshot = {
  id: 'thread-1',
  workspaceId: null,
  workspacePath: '/tmp',
  title: 'Thread',
  providerId: 'provider-1',
  provider: 'openai',
  modelId: 'gpt-5',
  thinkingLevel: 'medium',
  accessMode: 'standard',
  pinned: false,
  status: 'idle',
  isCompacting: false,
  queue: { steering: [], followUps: [] },
  todos: [],
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z'
}

describe('thread list status', () => {
  it('shows a generating state for active or compacting threads', () => {
    expect(isThreadGenerating({ ...thread, status: 'running' })).toBe(true)
    expect(isThreadGenerating({ ...thread, status: 'idle', isCompacting: true })).toBe(true)
    expect(getThreadListStatus({ ...thread, status: 'recovering' }, false)).toBe('generating')
  })

  it('prioritizes an approval request over an active generation indicator', () => {
    expect(
      getThreadListStatus(
        {
          ...thread,
          status: 'running',
          pendingInteraction: {
            id: 'approval-1',
            method: 'confirm',
            title: 'Allow command?',
            message: 'Run the command?'
          }
        },
        true
      )
    ).toBe('approval-needed')
  })

  it('shows an unread completion only when no more urgent state exists', () => {
    expect(getThreadListStatus(thread, true)).toBe('unread-completion')
    expect(getThreadListStatus(thread, false)).toBeNull()
  })

  it('notifies when an inactive generating thread settles and clears it when opened', () => {
    const previousThreads = new Map([[thread.id, { ...thread, status: 'running' as const }]])
    const completed = getUnreadCompletionThreadIds({
      currentUnreadThreadIds: new Set(),
      previousThreads,
      threads: [thread],
      activeThreadId: 'another-thread'
    })
    expect(completed).toEqual(new Set([thread.id]))

    expect(
      getUnreadCompletionThreadIds({
        currentUnreadThreadIds: completed,
        previousThreads: new Map([[thread.id, thread]]),
        threads: [thread],
        activeThreadId: thread.id
      })
    ).toEqual(new Set())
  })
})
