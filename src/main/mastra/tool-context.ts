import type { RequestContext } from '@mastra/core/request-context'

export const CHANNEL_CONTEXT_KEY = 'channelContext'
export const HEARTBEAT_RUN_CONTEXT_KEY = 'heartbeatRunId'
export const GROUP_CONTEXT_KEY = 'groupContext'

export type ChannelExecutionContext = {
  channelId: string
  channelType?: string
  remoteChatId: string
  userId: string
}

export type GroupExecutionContext = {
  runId: string
  groupThreadId: string
  assistantId: string
  allowedMentions: Array<{ assistantId: string; name: string }>
  replyToMessageId: string | null
  publishedMessagesCount: number
  passedTurn: boolean
}

export function getChannelExecutionContext(
  requestContext: RequestContext | undefined
): ChannelExecutionContext | null {
  const contextValue = requestContext?.get(CHANNEL_CONTEXT_KEY) as
    | ChannelExecutionContext
    | undefined

  if (!contextValue) {
    return null
  }

  if (
    typeof contextValue.channelId !== 'string' ||
    typeof contextValue.remoteChatId !== 'string' ||
    typeof contextValue.userId !== 'string'
  ) {
    return null
  }

  return contextValue
}

export function getHeartbeatRunId(requestContext: RequestContext | undefined): string | null {
  const contextValue = requestContext?.get(HEARTBEAT_RUN_CONTEXT_KEY)

  if (typeof contextValue !== 'string' || contextValue.trim().length === 0) {
    return null
  }

  return contextValue
}

export function getGroupExecutionContext(
  requestContext: RequestContext | undefined
): GroupExecutionContext | null {
  const contextValue = requestContext?.get(GROUP_CONTEXT_KEY) as GroupExecutionContext | undefined

  if (!contextValue) {
    return null
  }

  if (
    typeof contextValue.runId !== 'string' ||
    typeof contextValue.groupThreadId !== 'string' ||
    typeof contextValue.assistantId !== 'string' ||
    !Array.isArray(contextValue.allowedMentions) ||
    typeof contextValue.publishedMessagesCount !== 'number' ||
    typeof contextValue.passedTurn !== 'boolean'
  ) {
    return null
  }

  return {
    ...contextValue,
    allowedMentions: contextValue.allowedMentions.filter(
      (entry): entry is { assistantId: string; name: string } =>
        typeof entry?.assistantId === 'string' && typeof entry?.name === 'string'
    ),
    replyToMessageId:
      typeof contextValue.replyToMessageId === 'string' ? contextValue.replyToMessageId : null
  }
}
