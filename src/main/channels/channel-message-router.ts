import { randomUUID } from 'node:crypto'
import type { UIMessageWithMetadata } from '@mastra/core/agent/message-list'
import type { UIMessageChunk } from 'ai'
import type { AssistantRuntime } from '../mastra/assistant-runtime'
import type { ChannelThreadBindingsRepository } from '../persistence/repos/channel-thread-bindings-repo'
import type { ChannelsRepository } from '../persistence/repos/channels-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import { ChannelEventBus } from './channel-event-bus'
import type { ChannelMessageReceivedEvent } from './types'

type ChannelMessageRouterOptions = {
  eventBus: ChannelEventBus
  channelsRepo: Pick<ChannelsRepository, 'getById' | 'getRuntimeById'>
  bindingsRepo: ChannelThreadBindingsRepository
  threadsRepo: ThreadsRepository
  assistantRuntime: AssistantRuntime
  threadMessageEventsStore?: {
    appendMessagesUpdated(input: {
      assistantId: string
      threadId: string
      profileId: string
      source?: 'channel'
    }): unknown
  }
}

const DEFAULT_PROFILE_ID = 'default-profile'
const DEFAULT_THREAD_TITLE = 'New Thread'

function toFriendlyErrorMessage(raw: string): string {
  let statusCode: number | undefined
  let message = ''

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.statusCode === 'number') statusCode = parsed.statusCode
    if (typeof parsed.message === 'string') message = parsed.message
  } catch {
    message = raw
  }

  if (statusCode === 401 || statusCode === 403) {
    return 'Authentication failed. Please check the API key in provider settings.'
  }
  if (statusCode === 404) {
    return 'The configured model or API endpoint was not found. Please check the provider settings.'
  }
  if (statusCode === 429) {
    return 'Too many requests. Please wait a moment and try again.'
  }
  if (statusCode && statusCode >= 500 && statusCode <= 599) {
    return "The AI provider's server encountered an error. Please try again later."
  }

  const lower = message.toLowerCase()
  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('timeout') ||
    lower.includes('connection refused')
  ) {
    return 'Unable to connect to the AI provider. Please check the network and API host configuration.'
  }

  return 'Failed to generate a response. Please check the provider configuration.'
}

async function drainStream(stream: ReadableStream<UIMessageChunk>): Promise<string> {
  const reader = stream.getReader()
  let assistantText = ''
  let streamError: string | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      if (value.type === 'text-delta') {
        assistantText += value.delta
      } else if (value.type === 'error') {
        streamError = value.errorText
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (streamError && assistantText.trim().length === 0) {
    throw new Error(streamError)
  }

  return assistantText
}

export class ChannelMessageRouter {
  private unsubscribeReceived: (() => void) | null = null

  constructor(private readonly options: ChannelMessageRouterOptions) {}

  async start(): Promise<void> {
    if (this.unsubscribeReceived) {
      return
    }

    this.unsubscribeReceived = this.options.eventBus.subscribe(
      'channel.message.received',
      async (event) => {
        await this.handleInboundEvent(event)
      }
    )
  }

  async stop(): Promise<void> {
    if (!this.unsubscribeReceived) {
      return
    }

    this.unsubscribeReceived()
    this.unsubscribeReceived = null
  }

  async handleInboundEvent(event: ChannelMessageReceivedEvent): Promise<void> {
    const channel = await this.options.channelsRepo.getById(event.channelId)
    if (!channel?.assistantId) {
      return
    }

    const runtimeChannel = await this.options.channelsRepo.getRuntimeById(event.channelId)
    if (!runtimeChannel?.assistantId) {
      return
    }

    const existingBinding = await this.options.bindingsRepo.getByChannelAndRemoteChat(
      event.channelId,
      event.message.remoteChatId
    )

    const threadId =
      existingBinding?.threadId ??
      (
        await this.createThreadBinding({
          channelId: event.channelId,
          assistantId: runtimeChannel.assistantId,
          remoteChatId: event.message.remoteChatId
        })
      ).threadId

    const userMessage: UIMessageWithMetadata = {
      id: `channel:${event.channelId}:${event.message.id}`,
      content: event.message.content,
      role: 'user',
      parts: [{ type: 'text', text: event.message.content }],
      metadata: {
        fromChannel: event.channelType,
        channelId: event.channelId,
        channelType: event.channelType,
        remoteChatId: event.message.remoteChatId,
        remoteMessageId: event.message.id,
        senderId: event.message.senderId,
        ...(event.message.metadata ?? {})
      }
    }

    try {
      const stream = await this.options.assistantRuntime.streamChat({
        assistantId: runtimeChannel.assistantId,
        threadId,
        profileId: DEFAULT_PROFILE_ID,
        messages: [userMessage],
        channelTarget: {
          channelId: event.channelId,
          channelType: event.channelType,
          remoteChatId: event.message.remoteChatId
        }
      })

      await drainStream(stream)
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : 'An unknown error occurred'
      console.error(`[ChannelMessageRouter] streamChat failed: ${rawMessage}`)

      await this.options.eventBus.publish('channel.message.send-requested', {
        eventId: randomUUID(),
        channelId: event.channelId,
        channelType: event.channelType,
        remoteChatId: event.message.remoteChatId,
        content: `[Error] ${toFriendlyErrorMessage(rawMessage)}`
      })
      return
    }

    this.options.threadMessageEventsStore?.appendMessagesUpdated({
      assistantId: runtimeChannel.assistantId,
      threadId,
      profileId: DEFAULT_PROFILE_ID,
      source: 'channel'
    })
  }

  private async createThreadBinding(input: {
    channelId: string
    assistantId: string
    remoteChatId: string
  }) {
    const thread = await this.options.threadsRepo.create({
      assistantId: input.assistantId,
      resourceId: DEFAULT_PROFILE_ID,
      title: DEFAULT_THREAD_TITLE
    })

    return this.options.bindingsRepo.create({
      channelId: input.channelId,
      remoteChatId: input.remoteChatId,
      threadId: thread.id
    })
  }
}
