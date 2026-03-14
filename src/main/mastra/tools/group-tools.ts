import { randomUUID } from 'node:crypto'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { GroupEventBus } from '../../groups/group-event-bus'
import { getGroupExecutionContext } from '../tool-context'
import { logger } from '../../utils/logger'

type GroupToolsOptions = {
  bus: GroupEventBus
}

function normalizeMentionKey(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

function resolveMentions(
  mentions: string[],
  allowedMentions: Array<{ assistantId: string; name: string }>
): string[] {
  const resolvedMentions: string[] = []

  for (const mention of mentions) {
    const normalizedMention = normalizeMentionKey(mention)
    if (normalizedMention.length === 0) {
      continue
    }

    const matchedMention = allowedMentions.find((entry) => {
      return (
        normalizeMentionKey(entry.assistantId) === normalizedMention ||
        normalizeMentionKey(entry.name) === normalizedMention
      )
    })

    if (!matchedMention || resolvedMentions.includes(matchedMention.assistantId)) {
      continue
    }

    resolvedMentions.push(matchedMention.assistantId)
  }

  return resolvedMentions
}

export function createGroupTools(options: GroupToolsOptions) {
  const postToGroup = createTool({
    id: 'post-to-group',
    description:
      'Publish a room message back to the shared group thread. Use assistant IDs or roster display names in mentions.',
    inputSchema: z.object({
      message: z.string().trim().min(1),
      mentions: z.array(z.string()).default([])
    }),
    outputSchema: z.object({
      success: z.boolean(),
      mentions: z.array(z.string())
    }),
    execute: async ({ message, mentions }, context) => {
      const groupContext = getGroupExecutionContext(context.requestContext)
      if (!groupContext) {
        throw new Error('Group room context is missing for this run.')
      }

      const resolvedMentions = resolveMentions(mentions, groupContext.allowedMentions)

      logger.info('[GroupFlow] Assistant called postToGroup tool', {
        runId: groupContext.runId,
        groupThreadId: groupContext.groupThreadId,
        assistantId: groupContext.assistantId,
        mentionIds: resolvedMentions,
        replyToMessageId: groupContext.replyToMessageId ?? null,
        contentLength: message.trim().length
      })

      await options.bus.publish('group.message.requested', {
        eventId: randomUUID(),
        runId: groupContext.runId,
        groupThreadId: groupContext.groupThreadId,
        assistantId: groupContext.assistantId,
        content: message.trim(),
        mentions: resolvedMentions,
        ...(groupContext.replyToMessageId
          ? { replyToMessageId: groupContext.replyToMessageId }
          : {})
      })

      groupContext.publishedMessagesCount += 1

      return {
        success: true,
        mentions: resolvedMentions
      }
    }
  })

  const passGroupTurn = createTool({
    id: 'pass-group-turn',
    description: 'Pass the current group-room turn when you have nothing useful to add.',
    inputSchema: z.object({
      reason: z.string().trim().min(1).optional()
    }),
    outputSchema: z.object({
      success: z.boolean(),
      reason: z.string().nullable()
    }),
    execute: async ({ reason }, context) => {
      const groupContext = getGroupExecutionContext(context.requestContext)
      if (!groupContext) {
        throw new Error('Group room context is missing for this run.')
      }

      logger.info('[GroupFlow] Assistant called passGroupTurn tool', {
        runId: groupContext.runId,
        groupThreadId: groupContext.groupThreadId,
        assistantId: groupContext.assistantId,
        reason: reason ?? null
      })

      await options.bus.publish('group.turn.passed', {
        eventId: randomUUID(),
        runId: groupContext.runId,
        groupThreadId: groupContext.groupThreadId,
        assistantId: groupContext.assistantId,
        ...(reason ? { reason } : {})
      })

      groupContext.passedTurn = true

      return {
        success: true,
        reason: reason ?? null
      }
    }
  })

  return {
    postToGroup,
    passGroupTurn
  }
}
