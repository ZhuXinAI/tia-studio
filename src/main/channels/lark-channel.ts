import { readFile } from 'node:fs/promises'
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
      image: {
        create(input: {
          data: {
            image_type: 'message' | 'avatar'
            image: Buffer
          }
        }): Promise<{
          image_key?: string
        } | null>
      }
      message: {
        create(input: {
          params: {
            receive_id_type: 'chat_id'
          }
          data: {
            receive_id: string
            msg_type: 'text' | 'image'
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
  request?(input: { method: 'GET'; url: string }): Promise<unknown>
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
    chat_type?: string
    thread_id?: string
    create_time?: string
    message_type: string
    content: string
    mentions?: Array<{
      id?: {
        user_id?: string
        open_id?: string
        union_id?: string
      }
    }>
  }
}

type LarkBotInfoResponse = {
  code?: number
  msg?: string
  bot?: {
    user_id?: string
    open_id?: string
    union_id?: string
  }
}

export type LarkChannelOptions = {
  id: string
  appId: string
  appSecret: string
  groupRequireMention?: boolean
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

function isGroupChat(chatType: string | undefined): boolean {
  return chatType === 'group'
}

export class LarkChannel extends AbstractChannel {
  private readonly client: LarkClientLike
  private readonly wsClient: LarkWsClientLike
  private readonly eventDispatcher: LarkEventDispatcherLike
  private readonly groupRequireMention: boolean
  private readonly botMentionIds = new Set<string>()

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
    this.groupRequireMention = options.groupRequireMention ?? true
  }

  async start(): Promise<void> {
    await this.loadBotMentionIds()

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

  async sendImage(remoteChatId: string, filePath: string): Promise<void> {
    const imageBuffer = await readFile(filePath)
    const uploadResult = await this.client.im.v1.image.create({
      data: {
        image_type: 'message',
        image: imageBuffer
      }
    })

    const imageKey = uploadResult?.image_key?.trim()
    if (!imageKey) {
      throw new Error('Lark image upload did not return an image key.')
    }

    await this.client.im.v1.message.create({
      params: {
        receive_id_type: 'chat_id'
      },
      data: {
        receive_id: remoteChatId,
        msg_type: 'image',
        content: JSON.stringify({
          image_key: imageKey
        })
      }
    })
  }

  private toChannelMessage(event: LarkMessageReceiveEvent): ChannelMessage | null {
    if (event.message.message_type !== 'text') {
      return null
    }

    if (
      this.groupRequireMention &&
      isGroupChat(event.message.chat_type) &&
      !this.isBotMentioned(event.message)
    ) {
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
        larkChatType: event.message.chat_type ?? null,
        larkIsBotMentioned: isGroupChat(event.message.chat_type)
          ? this.isBotMentioned(event.message)
          : true,
        larkMessageId: event.message.message_id,
        larkThreadId: event.message.thread_id ?? null
      }
    }
  }

  private isBotMentioned(message: LarkMessageReceiveEvent['message']): boolean {
    const mentions = Array.isArray(message.mentions) ? message.mentions : []
    if (mentions.length === 0) {
      return false
    }

    if (this.botMentionIds.size === 0) {
      return true
    }

    return mentions.some((mention) => {
      const mentionIds = [mention.id?.user_id, mention.id?.open_id, mention.id?.union_id]
      return mentionIds.some((id) => (id ? this.botMentionIds.has(id) : false))
    })
  }

  private async loadBotMentionIds(): Promise<void> {
    if (typeof this.client.request !== 'function') {
      return
    }

    try {
      const response = (await this.client.request({
        method: 'GET',
        url: '/open-apis/bot/v3/info'
      })) as LarkBotInfoResponse

      if (response.code !== 0) {
        logger.warn(
          `[LarkChannel] Failed to fetch bot info for mention detection: ${response.msg ?? 'unknown error'}`
        )
        return
      }

      for (const id of [response.bot?.user_id, response.bot?.open_id, response.bot?.union_id]) {
        if (typeof id === 'string' && id.length > 0) {
          this.botMentionIds.add(id)
        }
      }
    } catch (error) {
      logger.warn('[LarkChannel] Failed to fetch bot info for mention detection:', error)
    }
  }
}
