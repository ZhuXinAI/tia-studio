import * as Lark from '@larksuiteoapi/node-sdk'
import { AbstractChannel } from './abstract-channel'
import type { ChannelMessage } from './types'
import { logger } from '../utils/logger'

type LarkLoggerLevel = {
  fatal: unknown
}

type LarkClientLike = {
  im: {
    v1: {
      message: {
        create(input: {
          params: {
            receive_id_type: 'chat_id'
          }
          data: {
            receive_id: string
            msg_type: 'text'
            content: string
          }
        }): Promise<unknown>
      }
      messageReaction: {
        create(input: {
          path: { message_id: string }
          data: { reaction_type: { emoji_type: string } }
        }): Promise<unknown>
      }
    }
  }
}

type LarkWsClientLike = {
  start(input: { eventDispatcher: LarkEventDispatcherLike }): Promise<void>
  close(): void
}

type LarkEventDispatcherLike = {
  register(handlers: Record<string, (event: unknown) => Promise<void> | void>): unknown
}

type LarkSdkLike = {
  Client: new (options: {
    appId: string
    appSecret: string
    loggerLevel: unknown
  }) => LarkClientLike
  WSClient: new (options: {
    appId: string
    appSecret: string
    loggerLevel: unknown
  }) => LarkWsClientLike
  EventDispatcher: new (options: { loggerLevel: unknown }) => LarkEventDispatcherLike
  LoggerLevel: LarkLoggerLevel
}

type LarkMessageReceiveEvent = {
  create_time?: string
  sender?: {
    sender_id?: {
      user_id?: string
      open_id?: string
      union_id?: string
    }
  }
  message: {
    message_id: string
    chat_id: string
    thread_id?: string
    create_time?: string
    message_type: string
    content: string
  }
}

export type LarkChannelOptions = {
  id: string
  appId: string
  appSecret: string
  sdk?: LarkSdkLike
}

const STALE_MESSAGE_MAX_AGE_MS = 30_000

function toTimestamp(value: string | undefined): Date {
  if (!value) {
    return new Date()
  }

  const numericTimestamp = Number(value)
  if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) {
    return new Date(numericTimestamp)
  }

  const parsedDate = new Date(value)
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate
  }

  return new Date()
}

function isStaleMessage(timestamp: Date): boolean {
  return Date.now() - timestamp.getTime() >= STALE_MESSAGE_MAX_AGE_MS
}

export class LarkChannel extends AbstractChannel {
  private readonly client: LarkClientLike
  private readonly wsClient: LarkWsClientLike
  private readonly eventDispatcher: LarkEventDispatcherLike

  constructor(options: LarkChannelOptions) {
    super(options.id, 'lark')

    const sdk = options.sdk ?? (Lark as unknown as LarkSdkLike)
    const loggerLevel = sdk.LoggerLevel.fatal

    this.client = new sdk.Client({
      appId: options.appId,
      appSecret: options.appSecret,
      loggerLevel
    })
    this.wsClient = new sdk.WSClient({
      appId: options.appId,
      appSecret: options.appSecret,
      loggerLevel
    })
    this.eventDispatcher = new sdk.EventDispatcher({
      loggerLevel
    })
  }

  async start(): Promise<void> {
    this.eventDispatcher.register({
      'im.message.receive_v1': async (event: unknown) => {
        const message = this.toChannelMessage(event as LarkMessageReceiveEvent)
        if (!message) {
          return
        }
        if (isStaleMessage(message.timestamp)) {
          return
        }

        void this.emitMessage(message).catch((error) => {
          logger.error(`[LarkChannel] Failed to process inbound message ${message.id}:`, error)
        })
      }
    })

    await this.wsClient.start({
      eventDispatcher: this.eventDispatcher
    })
  }

  async stop(): Promise<void> {
    this.wsClient.close()
  }

  async acknowledgeMessage(messageId: string): Promise<void> {
    await this.client.im.v1.messageReaction.create({
      path: { message_id: messageId },
      data: { reaction_type: { emoji_type: 'Get' } }
    })
  }

  async send(remoteChatId: string, message: string): Promise<void> {
    await this.client.im.v1.message.create({
      params: {
        receive_id_type: 'chat_id'
      },
      data: {
        receive_id: remoteChatId,
        msg_type: 'text',
        content: JSON.stringify({
          text: message
        })
      }
    })
  }

  private toChannelMessage(event: LarkMessageReceiveEvent): ChannelMessage | null {
    if (event.message.message_type !== 'text') {
      return null
    }

    let content = event.message.content
    try {
      const parsed = JSON.parse(event.message.content) as { text?: unknown }
      if (typeof parsed.text === 'string') {
        content = parsed.text
      }
    } catch {
      content = event.message.content
    }

    return {
      id: event.message.message_id,
      remoteChatId: event.message.chat_id,
      senderId:
        event.sender?.sender_id?.user_id ??
        event.sender?.sender_id?.open_id ??
        event.sender?.sender_id?.union_id ??
        '',
      content,
      timestamp: toTimestamp(event.message.create_time ?? event.create_time),
      metadata: {
        larkChatId: event.message.chat_id,
        larkMessageId: event.message.message_id,
        larkThreadId: event.message.thread_id ?? null
      }
    }
  }
}
