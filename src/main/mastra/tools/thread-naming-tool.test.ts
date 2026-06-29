import { describe, expect, it, vi } from 'vitest'
import { createThreadNamingTool } from './thread-naming-tool'

describe('thread naming tool', () => {
  it('renames the active thread and emits a refresh event', async () => {
    const appendMessagesUpdated = vi.fn()
    const getById = vi.fn(async () => ({
      id: 'thread-1',
      assistantId: 'assistant-1',
      resourceId: 'profile-1',
      title: '',
      metadata: {},
      lastMessageAt: null,
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z'
    }))
    const updateTitle = vi.fn(async () => ({
      id: 'thread-1',
      assistantId: 'assistant-1',
      resourceId: 'profile-1',
      title: 'Release plan checklist',
      metadata: {},
      lastMessageAt: null,
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z'
    }))

    const tools = createThreadNamingTool({
      assistantId: 'assistant-1',
      threadsRepo: {
        getById,
        updateTitle
      },
      threadMessageEventsStore: {
        appendMessagesUpdated
      }
    })

    if (!tools.threadNaming.execute) {
      throw new Error('Expected threadNaming.execute to exist')
    }

    const result = await tools.threadNaming.execute(
      {
        title: '  Release   plan checklist  '
      },
      {
        agent: {
          threadId: 'thread-1',
          resourceId: 'profile-1'
        }
      } as never
    )

    expect(updateTitle).toHaveBeenCalledWith('thread-1', 'Release plan checklist')
    expect(appendMessagesUpdated).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      threadId: 'thread-1',
      profileId: 'profile-1',
      source: 'command'
    })
    expect(result).toMatchObject({
      success: true,
      changed: true,
      threadId: 'thread-1',
      title: 'Release plan checklist'
    })
  })

  it('returns a no-op response when the current title already matches', async () => {
    const updateTitle = vi.fn()

    const tools = createThreadNamingTool({
      assistantId: 'assistant-1',
      threadsRepo: {
        getById: vi.fn(async () => ({
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'profile-1',
          title: 'Release plan checklist',
          metadata: {},
          lastMessageAt: null,
          createdAt: '2026-03-10T00:00:00.000Z',
          updatedAt: '2026-03-10T00:00:00.000Z'
        })),
        updateTitle
      }
    })

    if (!tools.threadNaming.execute) {
      throw new Error('Expected threadNaming.execute to exist')
    }

    const result = await tools.threadNaming.execute(
      {
        title: 'Release plan checklist'
      },
      {
        agent: {
          threadId: 'thread-1',
          resourceId: 'profile-1'
        }
      } as never
    )

    expect(updateTitle).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: true,
      changed: false,
      message: 'Thread title is already up to date.'
    })
  })
})
