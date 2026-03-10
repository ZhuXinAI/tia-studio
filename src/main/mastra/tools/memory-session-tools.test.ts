import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMemorySessionTools } from './memory-session-tools'

type ExecuteResult = {
  success: boolean
  scope: 'current-session' | 'specific-session' | 'all-sessions-for-user'
  deletedThreadIds: string[]
  deletedCount: number
  message: string
}

describe('createMemorySessionTools', () => {
  const mockMemory = {
    deleteThread: vi.fn(),
    getThreadById: vi.fn(),
    listThreads: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cleanup-memory-sessions', () => {
    it('should refuse cleanup when confirm is false', async () => {
      const tools = createMemorySessionTools(mockMemory)
      const result = (await tools.cleanupMemorySessions.execute?.(
        { scope: 'current-session', confirm: false },
        { agent: { threadId: 'thread-1', resourceId: 'user-1' } } as never
      )) as ExecuteResult

      expect(result.success).toBe(false)
      expect(result.message).toContain('Refused cleanup')
      expect(mockMemory.deleteThread).not.toHaveBeenCalled()
    })

    it('should delete current session when confirmed', async () => {
      mockMemory.getThreadById.mockResolvedValue({
        id: 'thread-1',
        resourceId: 'user-1'
      })
      mockMemory.deleteThread.mockResolvedValue(undefined)

      const tools = createMemorySessionTools(mockMemory)
      const result = (await tools.cleanupMemorySessions.execute?.(
        { scope: 'current-session', confirm: true },
        { agent: { threadId: 'thread-1', resourceId: 'user-1' } } as never
      )) as ExecuteResult

      expect(result.success).toBe(true)
      expect(result.deletedThreadIds).toEqual(['thread-1'])
      expect(mockMemory.deleteThread).toHaveBeenCalledWith('thread-1')
    })

    it('should delete specific session when threadId provided', async () => {
      mockMemory.getThreadById.mockResolvedValue({
        id: 'thread-2',
        resourceId: 'user-1'
      })
      mockMemory.deleteThread.mockResolvedValue(undefined)

      const tools = createMemorySessionTools(mockMemory)
      const result = (await tools.cleanupMemorySessions.execute?.(
        { scope: 'specific-session', threadId: 'thread-2', confirm: true },
        { agent: { resourceId: 'user-1' } } as never
      )) as ExecuteResult

      expect(result.success).toBe(true)
      expect(result.deletedThreadIds).toEqual(['thread-2'])
      expect(mockMemory.deleteThread).toHaveBeenCalledWith('thread-2')
    })

    it('should delete all sessions for user', async () => {
      mockMemory.listThreads.mockResolvedValue({
        threads: [
          { id: 'thread-1', resourceId: 'user-1' },
          { id: 'thread-2', resourceId: 'user-1' }
        ]
      })
      mockMemory.deleteThread.mockResolvedValue(undefined)

      const tools = createMemorySessionTools(mockMemory)
      const result = (await tools.cleanupMemorySessions.execute?.(
        { scope: 'all-sessions-for-user', confirm: true },
        { agent: { resourceId: 'user-1' } } as never
      )) as ExecuteResult

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(2)
      expect(result.deletedThreadIds).toEqual(['thread-1', 'thread-2'])
      expect(mockMemory.deleteThread).toHaveBeenCalledTimes(2)
    })

    it('should prevent deleting thread owned by another user', async () => {
      mockMemory.getThreadById.mockResolvedValue({
        id: 'thread-1',
        resourceId: 'user-2'
      })

      const tools = createMemorySessionTools(mockMemory)
      const result = (await tools.cleanupMemorySessions.execute?.(
        { scope: 'current-session', confirm: true },
        { agent: { threadId: 'thread-1', resourceId: 'user-1' } } as never
      )) as ExecuteResult

      expect(result.success).toBe(false)
      expect(result.message).toContain('belongs to another user')
      expect(mockMemory.deleteThread).not.toHaveBeenCalled()
    })

    it('should handle already empty thread', async () => {
      mockMemory.getThreadById.mockResolvedValue(null)

      const tools = createMemorySessionTools(mockMemory)
      const result = (await tools.cleanupMemorySessions.execute?.(
        { scope: 'current-session', confirm: true },
        { agent: { threadId: 'thread-1', resourceId: 'user-1' } } as never
      )) as ExecuteResult

      expect(result.success).toBe(true)
      expect(result.message).toContain('already empty')
      expect(mockMemory.deleteThread).not.toHaveBeenCalled()
    })

    it('should resolve thread from channel context', async () => {
      mockMemory.getThreadById.mockResolvedValue({
        id: 'channel-chat-1',
        resourceId: 'channel-user-1'
      })
      mockMemory.deleteThread.mockResolvedValue(undefined)

      const tools = createMemorySessionTools(mockMemory)
      const mockRequestContext = new Map()
      mockRequestContext.set('channelContext', {
        channelId: 'channel-1',
        remoteChatId: 'channel-chat-1',
        userId: 'channel-user-1'
      })

      const result = (await tools.cleanupMemorySessions.execute?.(
        { scope: 'current-session', confirm: true },
        { requestContext: mockRequestContext } as never
      )) as ExecuteResult

      expect(result.success).toBe(true)
      expect(result.deletedThreadIds).toEqual(['channel-chat-1'])
      expect(mockMemory.deleteThread).toHaveBeenCalledWith('channel-chat-1')
    })

    it('should fail when no thread context available', async () => {
      const tools = createMemorySessionTools(mockMemory)
      const result = (await tools.cleanupMemorySessions.execute?.(
        { scope: 'current-session', confirm: true },
        {} as never
      )) as ExecuteResult

      expect(result.success).toBe(false)
      expect(result.message).toContain('Cannot resolve the current memory session thread')
    })

    it('should fail when missing threadId for specific-session', async () => {
      const tools = createMemorySessionTools(mockMemory)
      const result = (await tools.cleanupMemorySessions.execute?.(
        { scope: 'specific-session', confirm: true },
        { agent: { resourceId: 'user-1' } } as never
      )) as ExecuteResult

      expect(result.success).toBe(false)
      expect(result.message).toContain('Missing threadId for specific-session cleanup')
    })

    it('should handle no sessions found for user', async () => {
      mockMemory.listThreads.mockResolvedValue({
        threads: []
      })

      const tools = createMemorySessionTools(mockMemory)
      const result = (await tools.cleanupMemorySessions.execute?.(
        { scope: 'all-sessions-for-user', confirm: true },
        { agent: { resourceId: 'user-1' } } as never
      )) as ExecuteResult

      expect(result.success).toBe(true)
      expect(result.message).toContain('No memory sessions were found')
      expect(mockMemory.deleteThread).not.toHaveBeenCalled()
    })
  })
})
