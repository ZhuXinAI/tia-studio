import { WSClient } from '@wecom/aibot-node-sdk'
import { AbstractChannel } from './abstract-channel'
import type { ChannelMessage } from './types'
import { logger } from '../utils/logger'

type WeComTextMessageBody = {
  msgid: string
  chatid?: string
  chattype?: 'single' | 'group'
  from: {
    userid: string
  }
  create_time?: number
  msgtype: 'text' | string
  text?: {
    content?: string
  }
}

type WeComTextMessageFrame = {
  body?: WeComTextMessageBody
}

type WeComClientLike = {
  on(event: 'message.text', handler: (frame: WeComTextMessageFrame) => void): unknown
  on(event: 'error', handler: (error: Error) => void): unknown
  connect(): unknown
  disconnect(): void
  sendMessage(
    chatId: string,
    body: {
      msgtype: 'markdown'
      markdown: {
        content: string
      }
    }
  ): Promise<unknown>
}

type WeComSdkLike = {
  WSClient: new (options: { botId: string; secret: string }) => WeComClientLike
}

export type WeComChannelOptions = {
  id: string
  botId: string
  secret: string
  sdk?: WeComSdkLike
  onFatalError?: (error: unknown) => Promise<void> | void
}

function toTimestamp(value: number | undefined): Date {
  if (!Number.isFinite(value)) {
    return new Date()
  }

  const numericValue = Number(value)
  const normalizedValue = numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue
  const timestamp = new Date(normalizedValue)

  if (Number.isNaN(timestamp.getTime())) {
    return new Date()
  }

  return timestamp
}

export class WeComChannel extends AbstractChannel {
  private readonly client: WeComClientLike
  private started = false
  private stopping = false

  constructor(private readonly options: WeComChannelOptions) {
    super(options.id, 'wecom')

    const sdk = options.sdk ?? { WSClient }
    this.client = new sdk.WSClient({
      botId: options.botId,
      secret: options.secret
    })

    this.client.on('message.text', (frame) => {
      const message = this.toChannelMessage(frame)
      if (!message) {
        return
      }

      void this.emitMessage(message).catch((error) => {
        logger.error(`[WeComChannel] Failed to process inbound message ${message.id}:`, error)
      })
    })

    this.client.on('error', (error) => {
      if (this.stopping) {
        return
      }

      void Promise.resolve(this.options.onFatalError?.(error)).catch((handlerError) => {
        logger.error('[WeComChannel] Failed to handle fatal error:', handlerError)
      })
    })
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.stopping = false
    this.started = true

    try {
      this.client.connect()
    } catch (error) {
      this.started = false
      throw error
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.stopping = true
    this.client.disconnect()
    this.started = false
  }

  async send(remoteChatId: string, message: string): Promise<void> {
    await this.client.sendMessage(remoteChatId, {
      msgtype: 'markdown',
      markdown: {
        content: message
      }
    })
  }

  private toChannelMessage(frame: WeComTextMessageFrame): ChannelMessage | null {
    const body = frame.body
    const content = body?.text?.content

    if (!body || body.msgtype !== 'text' || typeof content !== 'string') {
      return null
    }

    const senderId = body.from?.userid ?? ''
    const remoteChatId =
      typeof body.chatid === 'string' && body.chatid.trim().length > 0 ? body.chatid : senderId

    if (remoteChatId.length === 0) {
      return null
    }

    return {
      id: body.msgid,
      remoteChatId,
      senderId,
      content,
      timestamp: toTimestamp(body.create_time),
      metadata: {
        wecomChatId: body.chatid ?? null,
        wecomChatType: body.chattype ?? null,
        wecomMessageId: body.msgid
      }
    }
  }
}
