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
}

const DEFAULT_PROFILE_ID = 'default-profile'
const DEFAULT_THREAD_TITLE = 'New Thread'

async function consumeStream(stream: ReadableStream<UIMessageChunk>): Promise<void> {
  const reader = stream.getReader()

  try {
    while (true) {
      const { done } = await reader.read()
      if (done) {
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
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

    await consumeStream(stream)
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
