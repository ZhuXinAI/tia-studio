import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { ThreadsRepository } from '../../persistence/repos/threads-repo'

type CreateThreadNamingToolOptions = {
  assistantId: string
  threadsRepo: Pick<ThreadsRepository, 'getById' | 'updateTitle'>
  threadMessageEventsStore?: {
    appendMessagesUpdated(input: {
      assistantId: string
      threadId: string
      profileId: string
      source?: 'command'
    }): void
  }
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function resolveExecutionThreadContext(context: { agent?: { threadId?: string; resourceId?: string } }): {
  threadId?: string
  profileId?: string
} {
  const threadId =
    typeof context.agent?.threadId === 'string' && context.agent.threadId.trim().length > 0
      ? context.agent.threadId
      : undefined
  const profileId =
    typeof context.agent?.resourceId === 'string' && context.agent.resourceId.trim().length > 0
      ? context.agent.resourceId
      : undefined

  return {
    threadId,
    profileId
  }
}

export function createThreadNamingTool(options: CreateThreadNamingToolOptions) {
  const threadNaming = createTool({
    id: 'thread-naming',
    description:
      'Rename the current thread to a short, specific title. Use when the current title is empty, generic, outdated, or when the user explicitly asks to rename it.',
    inputSchema: z.object({
      title: z.string().min(1).describe('A concise thread title, ideally under 80 characters.')
    }),
    outputSchema: z.object({
      success: z.boolean(),
      changed: z.boolean(),
      threadId: z.string().nullable(),
      title: z.string().nullable(),
      previousTitle: z.string().nullable(),
      message: z.string()
    }),
    execute: async ({ title }, context) => {
      const normalizedTitle = normalizeTitle(title)
      if (normalizedTitle.length === 0) {
        return {
          success: false,
          changed: false,
          threadId: null,
          title: null,
          previousTitle: null,
          message: 'Thread title cannot be empty.'
        }
      }

      const executionContext = resolveExecutionThreadContext(context)
      if (!executionContext.threadId || !executionContext.profileId) {
        return {
          success: false,
          changed: false,
          threadId: null,
          title: null,
          previousTitle: null,
          message: 'Cannot resolve the current thread context.'
        }
      }

      const existingThread = await options.threadsRepo.getById(executionContext.threadId)
      if (!existingThread) {
        return {
          success: false,
          changed: false,
          threadId: executionContext.threadId,
          title: null,
          previousTitle: null,
          message: 'Current thread was not found.'
        }
      }

      if (existingThread.resourceId !== executionContext.profileId) {
        return {
          success: false,
          changed: false,
          threadId: existingThread.id,
          title: null,
          previousTitle: existingThread.title,
          message: 'Current thread belongs to a different profile.'
        }
      }

      const previousTitle = existingThread.title
      if (normalizeTitle(previousTitle) === normalizedTitle) {
        return {
          success: true,
          changed: false,
          threadId: existingThread.id,
          title: previousTitle,
          previousTitle,
          message: 'Thread title is already up to date.'
        }
      }

      const updatedThread = await options.threadsRepo.updateTitle(existingThread.id, normalizedTitle)
      if (!updatedThread) {
        return {
          success: false,
          changed: false,
          threadId: existingThread.id,
          title: null,
          previousTitle,
          message: 'Failed to update the current thread title.'
        }
      }

      options.threadMessageEventsStore?.appendMessagesUpdated({
        assistantId: options.assistantId,
        threadId: updatedThread.id,
        profileId: executionContext.profileId,
        source: 'command'
      })

      return {
        success: true,
        changed: true,
        threadId: updatedThread.id,
        title: updatedThread.title,
        previousTitle,
        message: `Thread renamed to "${updatedThread.title}".`
      }
    }
  })

  return {
    threadNaming
  }
}
