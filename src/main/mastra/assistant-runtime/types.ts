import type { MessageListInput } from '@mastra/core/agent/message-list'
import type { UIMessage, UIMessageChunk } from 'ai'
import type { ChannelTarget } from '../../channels/types'

export type StreamChatParams = {
  assistantId: string
  messages: MessageListInput
  threadId: string
  profileId: string
  channelTarget?: ChannelTarget
  trigger?: 'submit-message' | 'regenerate-message'
  abortSignal?: AbortSignal
}

export type ListThreadMessagesParams = {
  assistantId: string
  threadId: string
  profileId: string
}

export type RunThreadCommandParams = {
  assistantId: string
  threadId: string
  profileId: string
  command: 'new'
}

export type ThreadCommandResult = {
  command: 'new'
  archiveFileName: string
  archiveFilePath: string
  threadTitle: string
  compactedAt: string
}

export type RunCronJobParams = {
  assistantId: string
  threadId: string
  prompt: string
  channelId?: string
  remoteChatId?: string
}

export type RunHeartbeatParams = {
  assistantId: string
  threadId: string
  prompt: string
  intervalMinutes: number
}

export type CronJobRunResult = {
  outputText: string
}

export type AssistantRuntime = {
  streamChat: (params: StreamChatParams) => Promise<ReadableStream<UIMessageChunk>>
  listThreadMessages: (params: ListThreadMessagesParams) => Promise<UIMessage[]>
  runThreadCommand: (params: RunThreadCommandParams) => Promise<ThreadCommandResult>
  runCronJob: (params: RunCronJobParams) => Promise<CronJobRunResult>
  runHeartbeat: (params: RunHeartbeatParams) => Promise<CronJobRunResult>
}
