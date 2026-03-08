import type { RequestContext } from '@mastra/core/request-context'

export const CHANNEL_CONTEXT_KEY = 'channelContext'
export const HEARTBEAT_RUN_CONTEXT_KEY = 'heartbeatRunId'

export type ChannelExecutionContext = {
  channelId: string
  channelType?: string
  remoteChatId: string
  userId: string
}

export function getChannelExecutionContext(
  requestContext: RequestContext | undefined
): ChannelExecutionContext | null {
  const contextValue = requestContext?.get(CHANNEL_CONTEXT_KEY) as ChannelExecutionContext | undefined

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
