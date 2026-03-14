import { WechatKfRelayClient } from 'wechat-kf-relay/client'
import type {
  RelayClientEventMap,
  RelayMessageOnEventPayload,
  RelaySendTextPayload,
  RelayWireWechatEnterSessionEvent,
  RelayWireWechatMessage
} from 'wechat-kf-relay'
import { AbstractChannel } from './abstract-channel'
import type { ChannelMessage } from './types'
import { logger } from '../utils/logger'

const INBOUND_TEXT_ORIGIN = 3
const CHANNEL_BREAK_TAG = '[[BR]]'

type WechatKfRelayClientLike = {
  on<EventName extends keyof RelayClientEventMap>(
    eventName: EventName,
    listener: (payload: RelayClientEventMap[EventName]) => void
  ): unknown
  once<EventName extends keyof RelayClientEventMap>(
    eventName: EventName,
    listener: (payload: RelayClientEventMap[EventName]) => void
  ): unknown
  off<EventName extends keyof RelayClientEventMap>(
    eventName: EventName,
    listener: (payload: RelayClientEventMap[EventName]) => void
  ): unknown
  connect(): void
  disconnect(code?: number, reason?: string): void
  syncNow(token?: string): void
  sendText(payload: RelaySendTextPayload): void
  messageOnEvent(payload: RelayMessageOnEventPayload): void
}

type WechatKfRemoteChatTarget = {
  openKfId: string
  externalUserId: string
}

export type WechatKfChannelOptions = {
  id: string
  serverUrl: string
  serverKey: string
  welcomeMessage?: string
  clientFactory?: (input: { url: string; key: string }) => WechatKfRelayClientLike
  onFatalError?: (error: unknown) => Promise<void> | void
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  return new Error(typeof error === 'string' ? error : 'Unknown error')
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

function sanitizeOutboundMessage(message: string): string {
  return message.replaceAll(CHANNEL_BREAK_TAG, '\n').trim()
}

export function buildWechatKfRemoteChatId(target: WechatKfRemoteChatTarget): string {
  return JSON.stringify(target)
}

export function parseWechatKfRemoteChatId(remoteChatId: string): WechatKfRemoteChatTarget {
  let parsed: unknown

  try {
    parsed = JSON.parse(remoteChatId)
  } catch {
    throw new Error(`Invalid Wechat-KF remote chat target: ${remoteChatId}`)
  }

  let candidate: Partial<WechatKfRemoteChatTarget> | null = null
  if (parsed && typeof parsed === 'object') {
    candidate = parsed as Partial<WechatKfRemoteChatTarget>
  }

  if (
    !candidate ||
    typeof candidate.openKfId !== 'string' ||
    candidate.openKfId.trim().length === 0 ||
    typeof candidate.externalUserId !== 'string' ||
    candidate.externalUserId.trim().length === 0
  ) {
    throw new Error(`Invalid Wechat-KF remote chat target: ${remoteChatId}`)
  }

  return {
    openKfId: candidate.openKfId,
    externalUserId: candidate.externalUserId
  }
}

export class WechatKfChannel extends AbstractChannel {
  private readonly client: WechatKfRelayClientLike
  private started = false
  private stopping = false
  private authenticated = false

  constructor(private readonly options: WechatKfChannelOptions) {
    super(options.id, 'wechat-kf')

    console.log('WechatKfChannel', options)
    this.client =
      options.clientFactory?.({
        url: options.serverUrl,
        key: options.serverKey
      }) ??
      new WechatKfRelayClient({
        url: options.serverUrl,
        key: options.serverKey
      })

    this.client.on('authenticated', () => {
      console.log('authenticated')
      this.authenticated = true
    })
    this.client.on('wechat.message', (message) => {
      const normalizedMessage = this.toChannelMessage(message)
      if (!normalizedMessage) {
        return
      }

      void this.emitMessage(normalizedMessage).catch((error) => {
        logger.error(
          `[WechatKfChannel] Failed to process inbound message ${normalizedMessage.id}:`,
          error
        )
      })
    })
    this.client.on('wechat.enter_session', (event) => {
      void this.handleEnterSession(event)
    })
    this.client.on('relay.error', (event) => {
      console.log('relay.error', event)
      if (!this.started || !this.authenticated || this.stopping) {
        return
      }

      void this.handleFatalError(new Error(event.error))
    })
    this.client.on('socket.error', (error) => {
      console.log('socket.error', error)
      if (!this.started || !this.authenticated || this.stopping) {
        return
      }

      void this.handleFatalError(error)
    })
    this.client.on('close', (event) => {
      console.log('close', event)
      if (!this.started || !this.authenticated || this.stopping) {
        return
      }

      const reasonSuffix = event.reason.trim().length > 0 ? `: ${event.reason}` : ''
      void this.handleFatalError(
        new Error(`Relay connection closed (${event.code})${reasonSuffix}`)
      )
    })
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.stopping = false
    this.started = true
    this.authenticated = false

    const startPromise = new Promise<void>((resolve, reject) => {
      const settle = (callback: () => void) => {
        this.client.off('authenticated', handleAuthenticated)
        this.client.off('relay.error', handleRelayError)
        this.client.off('socket.error', handleSocketError)
        this.client.off('close', handleClose)
        callback()
      }
      const handleAuthenticated = () => {
        settle(resolve)
      }
      const handleRelayError = (event: RelayClientEventMap['relay.error']) => {
        settle(() => reject(new Error(event.error)))
      }
      const handleSocketError = (error: RelayClientEventMap['socket.error']) => {
        settle(() => reject(error))
      }
      const handleClose = (event: RelayClientEventMap['close']) => {
        const reasonSuffix = event.reason.trim().length > 0 ? `: ${event.reason}` : ''
        settle(() => reject(new Error(`Relay connection closed (${event.code})${reasonSuffix}`)))
      }

      this.client.once('authenticated', handleAuthenticated)
      this.client.once('relay.error', handleRelayError)
      this.client.once('socket.error', handleSocketError)
      this.client.once('close', handleClose)

      try {
        this.client.connect()
      } catch (error) {
        settle(() => reject(toError(error)))
      }
    })

    try {
      console.log('startPromise')
      await startPromise
    } catch (error) {
      console.log('startPromise error', error)
      this.started = false
      this.authenticated = false
      this.stopping = false

      try {
        this.client.disconnect(1011, 'wechat-kf-start-failed')
      } catch {
        // Ignore disconnect failures while handling startup errors.
      }

      throw error
    }

    try {
      this.client.syncNow()
    } catch (error) {
      logger.warn('[WechatKfChannel] Failed to trigger initial sync:', error)
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.stopping = true
    this.started = false
    this.authenticated = false

    try {
      this.client.disconnect(1000, 'wechat-kf-channel-stopped')
    } finally {
      this.stopping = false
    }
  }

  async send(remoteChatId: string, message: string): Promise<void> {
    const target = parseWechatKfRemoteChatId(remoteChatId)
    const content = sanitizeOutboundMessage(message)
    if (content.length === 0) {
      return
    }

    this.client.sendText({
      open_kfid: target.openKfId,
      external_userid: target.externalUserId,
      content
    })
  }

  private async handleEnterSession(event: RelayWireWechatEnterSessionEvent): Promise<void> {
    if (!this.started || this.stopping || !event.welcome_code) {
      return
    }

    try {
      // We don't send welcome message now
      // this.client.messageOnEvent({
      //   code: event.welcome_code,
      //   content: ""
      // })
    } catch (error) {
      await this.handleFatalError(error)
    }
  }

  private async handleFatalError(error: unknown): Promise<void> {
    try {
      await this.options.onFatalError?.(toError(error))
    } catch (handlerError) {
      logger.error('[WechatKfChannel] Failed to handle fatal error:', handlerError)
    }
  }

  private toChannelMessage(message: RelayWireWechatMessage): ChannelMessage | null {
    const content = message.text?.content?.trim()
    if (
      message.origin !== INBOUND_TEXT_ORIGIN ||
      message.msgtype !== 'text' ||
      typeof content !== 'string' ||
      content.length === 0
    ) {
      return null
    }

    return {
      id: message.message_id,
      remoteChatId: buildWechatKfRemoteChatId({
        openKfId: message.open_kfid,
        externalUserId: message.external_userid
      }),
      senderId: message.external_userid,
      content,
      timestamp: toTimestamp(message.send_time),
      metadata: {
        wechatKfMessageId: message.message_id,
        wechatKfOpenKfId: message.open_kfid,
        wechatKfExternalUserId: message.external_userid,
        wechatKfOrigin: message.origin,
        wechatKfMessageType: message.msgtype,
        wechatKfRaw: message.raw
      }
    }
  }
}
