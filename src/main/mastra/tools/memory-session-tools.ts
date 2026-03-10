import type { Memory } from '@mastra/memory'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getChannelExecutionContext } from '../tool-context'

const cleanupScopes = ['current-session', 'specific-session', 'all-sessions-for-user'] as const

type MemoryCleanupScope = (typeof cleanupScopes)[number]

type MemoryCleanupStore = Pick<Memory, 'deleteThread' | 'getThreadById' | 'listThreads'>

function resolveExecutionMemoryContext(context: {
  agent?: { threadId?: string; resourceId?: string }
  requestContext?: Parameters<typeof getChannelExecutionContext>[0]
}): {
  threadId?: string
  resourceId?: string
} {
  const threadFromAgent =
    typeof context.agent?.threadId === 'string' && context.agent.threadId.trim().length > 0
      ? context.agent.threadId
      : undefined
  const resourceFromAgent =
    typeof context.agent?.resourceId === 'string' && context.agent.resourceId.trim().length > 0
      ? context.agent.resourceId
      : undefined

  const channelContext = getChannelExecutionContext(context.requestContext)
  const threadFromChannel = channelContext?.remoteChatId?.trim() || undefined
  const resourceFromChannel = channelContext?.userId?.trim() || undefined

  return {
    threadId: threadFromAgent ?? threadFromChannel,
    resourceId: resourceFromAgent ?? resourceFromChannel
  }
}

function response({
  success,
  scope,
  deletedThreadIds = [],
  message
}: {
  success: boolean
  scope: MemoryCleanupScope
  deletedThreadIds?: string[]
  message: string
}) {
  return {
    success,
    scope,
    deletedThreadIds,
    deletedCount: deletedThreadIds.length,
    message
  }
}

async function deleteThreadWithOwnershipCheck({
  memory,
  threadId,
  resourceId
}: {
  memory: MemoryCleanupStore
  threadId: string
  resourceId?: string
}): Promise<
  | {
      ok: true
      deleted: boolean
    }
  | {
      ok: false
      message: string
    }
> {
  const thread = await memory.getThreadById({ threadId })

  if (!thread) {
    return {
      ok: true,
      deleted: false
    }
  }

  if (resourceId && thread.resourceId !== resourceId) {
    return {
      ok: false,
      message: `Memory session ${threadId} belongs to another user and was not deleted.`
    }
  }

  await memory.deleteThread(threadId)

  return {
    ok: true,
    deleted: true
  }
}

export function createMemorySessionTools(memory: MemoryCleanupStore) {
  const cleanupMemorySessions = createTool({
    id: 'cleanup-memory-sessions',
    description:
      'Manually clean up memory sessions. Use only when the user explicitly asks to clear conversation memory or start a new session.',
    inputSchema: z.object({
      scope: z.enum(cleanupScopes).default('current-session'),
      threadId: z.string().optional().describe('Required when scope is specific-session.'),
      confirm: z
        .union([z.boolean(), z.enum(['false', 'true', 'True', 'False'])])
        .default(false)
        .describe('Must be true or "true" when the user confirms memory cleanup.')
    }),
    outputSchema: z.object({
      success: z.boolean(),
      scope: z.enum(cleanupScopes),
      deletedThreadIds: z.array(z.string()),
      deletedCount: z.number(),
      message: z.string()
    }),
    execute: async ({ scope, threadId, confirm }, context) => {
      if (confirm === false || confirm === 'false' || confirm === 'False') {
        return response({
          success: false,
          scope,
          message: 'Refused cleanup. Re-run with confirm=true after explicit user approval.'
        })
      }

      const executionContext = resolveExecutionMemoryContext(context)

      if (scope === 'all-sessions-for-user') {
        if (!executionContext.resourceId) {
          return response({
            success: false,
            scope,
            message: 'Cannot identify the active user. Provide resource context before cleanup.'
          })
        }

        const { threads } = await memory.listThreads({
          perPage: false,
          filter: {
            resourceId: executionContext.resourceId
          }
        })

        if (threads.length === 0) {
          return response({
            success: true,
            scope,
            message: 'No memory sessions were found for the active user.'
          })
        }

        for (const thread of threads) {
          await memory.deleteThread(thread.id)
        }

        return response({
          success: true,
          scope,
          deletedThreadIds: threads.map((thread) => thread.id),
          message: `Deleted ${threads.length} memory session(s) for the active user.`
        })
      }

      const targetThreadId =
        scope === 'current-session' ? executionContext.threadId : threadId?.trim()

      if (!targetThreadId) {
        return response({
          success: false,
          scope,
          message:
            scope === 'specific-session'
              ? 'Missing threadId for specific-session cleanup.'
              : 'Cannot resolve the current memory session thread.'
        })
      }

      const deleted = await deleteThreadWithOwnershipCheck({
        memory,
        threadId: targetThreadId,
        resourceId: executionContext.resourceId
      })

      if (!deleted.ok) {
        return response({
          success: false,
          scope,
          message: deleted.message
        })
      }

      if (!deleted.deleted) {
        return response({
          success: true,
          scope,
          message: `Memory session ${targetThreadId} was already empty.`
        })
      }

      return response({
        success: true,
        scope,
        deletedThreadIds: [targetThreadId],
        message: `Deleted memory session ${targetThreadId}.`
      })
    }
  })

  return {
    cleanupMemorySessions
  }
}
