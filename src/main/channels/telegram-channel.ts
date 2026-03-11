import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import type { ChannelPairingsRepository } from '../persistence/repos/channel-pairings-repo'
import { AbstractChannel } from './abstract-channel'
import type { ChannelMessage } from './types'
import { logger } from '../utils/logger'

const PENDING_PAIRING_LIMIT = 3
const PAIRING_TTL_MS = 60 * 60 * 1000
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PAIRING_CODE_LENGTH = 8

type TelegramInboundTextMessage = {
  id: string
  chatId: string
  chatType: string
  senderId: string
  senderUsername: string | null
  senderDisplayName: string
  text: string
  timestamp: Date
  reply(text: string): Promise<void>
}

type TelegramClientLike = {
  onText(handler: (message: TelegramInboundTextMessage) => Promise<void>): void
  launch(): Promise<void>
  stop(reason?: string): void
  sendMessage(chatId: string, text: string): Promise<void>
}

type ChannelPairingsRepositoryLike = Pick<
  ChannelPairingsRepository,
  'getByChannelAndSender' | 'countActivePendingByChannelId' | 'createOrRefreshPending'
>

export type TelegramChannelOptions = {
  id: string
  botToken: string
  pairingsRepo: ChannelPairingsRepositoryLike
  client?: TelegramClientLike
  now?: () => Date
  generateCode?: () => string
  onFatalError?: (error: unknown) => Promise<void> | void
}

function buildDisplayName(input: {
  firstName?: string | null
  lastName?: string | null
  username?: string | null
  id?: string | number
}): string {
  const name = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(' ').trim()

  if (name.length > 0) {
    return name
  }

  if (input.username && input.username.trim().length > 0) {
    return `@${input.username.trim()}`
  }

  return String(input.id ?? '')
}

function createTelegramClient(botToken: string): TelegramClientLike {
  const bot = new Telegraf(botToken)

  return {
    onText(handler) {
      bot.on(message('text'), async (context) => {
        const chat = context.chat
        const sender = context.from
        const text = context.message.text

        await handler({
          id: String(context.message.message_id),
          chatId: String(chat.id),
          chatType: String(chat.type),
          senderId: String(sender.id),
          senderUsername: sender.username ?? null,
          senderDisplayName: buildDisplayName({
            firstName: sender.first_name,
            lastName: sender.last_name,
            username: sender.username,
            id: sender.id
          }),
          text,
          timestamp: new Date(context.message.date * 1000),
          reply: async (replyText: string) => {
            await context.reply(replyText)
          }
        })
      })
    },
    async launch() {
      await bot.launch()
    },
    stop(reason?: string) {
      try {
        bot.stop(reason)
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Bot is not running!') {
          throw error
        }
      }
    },
    async sendMessage(chatId: string, text: string) {
      await bot.telegram.sendMessage(chatId, text)
    }
  }
}

function defaultGenerateCode(): string {
  let code = ''

  while (code.length < PAIRING_CODE_LENGTH) {
    const index = Math.floor(Math.random() * PAIRING_CODE_ALPHABET.length)
    code += PAIRING_CODE_ALPHABET[index] ?? 'A'
  }

  return code
}

function isActivePending(expiresAt: string | null, nowIso: string): boolean {
  return typeof expiresAt === 'string' && expiresAt > nowIso
}

function createPairingReply(code: string): string {
  return `Pairing required. Approval code: ${code}. Approve this request in TIA Studio before chatting.`
}

function createBlockedReply(): string {
  return 'This chat is not approved for this assistant.'
}

export class TelegramChannel extends AbstractChannel {
  private readonly client: TelegramClientLike
  private readonly now: () => Date
  private readonly generateCode: () => string
  private started = false
  private stopping = false

  constructor(private readonly options: TelegramChannelOptions) {
    super(options.id, 'telegram')

    this.client = options.client ?? createTelegramClient(options.botToken)
    this.now = options.now ?? (() => new Date())
    this.generateCode = options.generateCode ?? defaultGenerateCode
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.stopping = false
    this.client.onText(async (message) => {
      await this.handleInboundMessage(message)
    })
    this.started = true

    void Promise.resolve()
      .then(() => this.client.launch())
      .catch(async (error) => {
        if (this.stopping) {
          return
        }

        this.started = false
        try {
          this.client.stop('telegram-channel-failed')
        } catch {
          // Ignore stop failures while handling transport startup errors.
        }
        await this.options.onFatalError?.(error)
      })
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.stopping = true
    this.client.stop('telegram-channel-stopped')
    this.started = false
  }

  async send(remoteChatId: string, message: string): Promise<void> {
    await this.client.sendMessage(remoteChatId, message)
  }

  private async handleInboundMessage(message: TelegramInboundTextMessage): Promise<void> {
    if (message.chatType !== 'private') {
      return
    }

    const content = message.text.trim()
    if (content.length === 0) {
      return
    }

    const now = this.now()
    const nowIso = now.toISOString()
    const pairing = await this.options.pairingsRepo.getByChannelAndSender(
      this.id,
      message.chatId,
      message.senderId
    )

    if (pairing?.status === 'approved') {
      void this.emitApprovedMessage(message, content).catch((error) => {
        logger.error(`[TelegramChannel] Failed to process inbound message ${message.id}:`, error)
      })
      return
    }

    if (pairing?.status === 'rejected' || pairing?.status === 'revoked') {
      await message.reply(createBlockedReply())
      return
    }

    if (pairing?.status === 'pending' && isActivePending(pairing.expiresAt, nowIso)) {
      await message.reply(createPairingReply(pairing.code))
      return
    }

    const activePendingCount = await this.options.pairingsRepo.countActivePendingByChannelId(
      this.id,
      nowIso
    )
    if (activePendingCount >= PENDING_PAIRING_LIMIT) {
      return
    }

    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS).toISOString()
    const createdPairing = await this.options.pairingsRepo.createOrRefreshPending({
      channelId: this.id,
      remoteChatId: message.chatId,
      senderId: message.senderId,
      senderDisplayName: message.senderDisplayName,
      senderUsername: message.senderUsername,
      code: this.generateCode(),
      expiresAt,
      lastSeenAt: nowIso
    })

    await message.reply(createPairingReply(createdPairing.code))
  }

  private async emitApprovedMessage(
    message: TelegramInboundTextMessage,
    content: string
  ): Promise<void> {
    const normalized: ChannelMessage = {
      id: message.id,
      remoteChatId: message.chatId,
      senderId: message.senderId,
      content,
      timestamp: message.timestamp,
      metadata: {
        telegramChatId: message.chatId,
        telegramMessageId: message.id,
        telegramUsername: message.senderUsername,
        telegramDisplayName: message.senderDisplayName
      }
    }

    await this.emitMessage(normalized)
  }
}
