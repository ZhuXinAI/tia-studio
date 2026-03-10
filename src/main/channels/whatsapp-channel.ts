import { rm } from 'node:fs/promises'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  getContentType,
  isJidBroadcast,
  isJidGroup,
  jidDecode,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
  type ConnectionState,
  type WAMessage,
  type WASocket
} from '@whiskeysockets/baileys'
import * as QRCode from 'qrcode'
import type { ChannelPairingsRepository } from '../persistence/repos/channel-pairings-repo'
import { AbstractChannel } from './abstract-channel'
import type { ChannelMessage } from './types'
import type { WhatsAppAuthStateStore } from './whatsapp-auth-state-store'

const PENDING_PAIRING_LIMIT = 3
const PAIRING_TTL_MS = 60 * 60 * 1000
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PAIRING_CODE_LENGTH = 8
const RECONNECT_DELAY_MS = 1_000

type ChannelPairingsRepositoryLike = Pick<
  ChannelPairingsRepository,
  'getByChannelAndSender' | 'countActivePendingByChannelId' | 'createOrRefreshPending'
>

type WhatsAppAuthStateStoreLike = Pick<
  WhatsAppAuthStateStore,
  'setConnecting' | 'setQrCode' | 'setConnected' | 'setDisconnected' | 'setError'
>

type WhatsAppInboundTextMessage = {
  id: string
  chatId: string
  senderId: string
  senderUsername: string | null
  senderDisplayName: string
  text: string
  timestamp: Date
}

type WhatsAppConnectionUpdate =
  | { status: 'connecting' }
  | { status: 'qr_ready'; qrCodeValue: string; qrCodeDataUrl: string }
  | { status: 'connected'; phoneNumber: string | null }
  | { status: 'disconnected'; errorMessage: string | null; disconnectReason: number | null }
  | { status: 'error'; errorMessage: string }

type WhatsAppClientLike = {
  onConnectionUpdate(handler: (update: WhatsAppConnectionUpdate) => Promise<void> | void): void
  onText(handler: (message: WhatsAppInboundTextMessage) => Promise<void>): void
  connect(): Promise<void>
  disconnect(reason?: string): Promise<void>
  sendMessage(chatId: string, text: string): Promise<void>
  resetAuthState(): Promise<void>
}

export type WhatsAppChannelOptions = {
  id: string
  authDirectoryPath: string
  pairingsRepo: ChannelPairingsRepositoryLike
  authStateStore: WhatsAppAuthStateStoreLike
  clientFactory?: (authDirectoryPath: string) => Promise<WhatsAppClientLike>
  now?: () => Date
  generateCode?: () => string
  reconnectDelayMs?: number
  onFatalError?: (error: unknown) => Promise<void> | void
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return typeof error === 'string' ? error : 'Unknown error'
}

function resolveDisconnectReason(error: unknown): number | null {
  const statusCode =
    error &&
    typeof error === 'object' &&
    'output' in error &&
    error.output &&
    typeof error.output === 'object' &&
    'statusCode' in error.output
      ? Number(error.output.statusCode)
      : Number.NaN

  return Number.isFinite(statusCode) ? statusCode : null
}

function resolvePhoneNumber(jid: string | undefined): string | null {
  const decoded = jidDecode(jid)
  return typeof decoded?.user === 'string' && decoded.user.trim().length > 0 ? decoded.user : null
}

function resolveTimestamp(value: unknown): Date {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000)
  }

  if (typeof value === 'bigint') {
    return new Date(Number(value) * 1000)
  }

  if (value && typeof value === 'object' && 'toString' in value) {
    const asNumber = Number(String(value))
    if (Number.isFinite(asNumber)) {
      return new Date(asNumber * 1000)
    }
  }

  return new Date()
}

function buildSenderDisplayName(message: WAMessage, senderId: string): string {
  const pushName = typeof message.pushName === 'string' ? message.pushName.trim() : ''
  if (pushName.length > 0) {
    return pushName
  }

  return resolvePhoneNumber(senderId) ?? senderId
}

function normalizeInboundTextMessage(message: WAMessage): WhatsAppInboundTextMessage | null {
  if (message.key.fromMe) {
    return null
  }

  const chatId = message.key.remoteJid
  if (!chatId || isJidGroup(chatId) || isJidBroadcast(chatId)) {
    return null
  }

  const normalizedContent = normalizeMessageContent(message.message)
  const contentType = getContentType(normalizedContent)
  const text =
    contentType === 'conversation'
      ? normalizedContent?.conversation
      : contentType === 'extendedTextMessage'
        ? normalizedContent?.extendedTextMessage?.text
        : null

  if (typeof text !== 'string') {
    return null
  }

  const trimmedText = text.trim()
  if (trimmedText.length === 0) {
    return null
  }

  const senderId = jidNormalizedUser(message.key.participant ?? chatId)

  return {
    id: message.key.id ?? `${chatId}:${String(message.messageTimestamp ?? Date.now())}`,
    chatId,
    senderId,
    senderUsername: null,
    senderDisplayName: buildSenderDisplayName(message, senderId),
    text: trimmedText,
    timestamp: resolveTimestamp(message.messageTimestamp)
  }
}

async function createWhatsAppClient(authDirectoryPath: string): Promise<WhatsAppClientLike> {
  let socket: WASocket | null = null
  let handleConnectionUpdate: (update: WhatsAppConnectionUpdate) => Promise<void> | void = () =>
    undefined
  let handleText: (message: WhatsAppInboundTextMessage) => Promise<void> = async () => undefined

  return {
    onConnectionUpdate(handler) {
      handleConnectionUpdate = handler
    },
    onText(handler) {
      handleText = handler
    },
    async connect() {
      const { state, saveCreds } = await useMultiFileAuthState(authDirectoryPath)
      socket = makeWASocket({
        auth: state,
        browser: Browsers.macOS('TIA Studio'),
        markOnlineOnConnect: false
      })

      socket.ev.on('creds.update', () => {
        void saveCreds()
      })
      socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
        void (async () => {
          if (update.qr) {
            const qrCodeDataUrl = await QRCode.toDataURL(update.qr)
            await handleConnectionUpdate({
              status: 'qr_ready',
              qrCodeValue: update.qr,
              qrCodeDataUrl
            })
            return
          }

          if (update.connection === 'connecting') {
            await handleConnectionUpdate({ status: 'connecting' })
            return
          }

          if (update.connection === 'open') {
            await handleConnectionUpdate({
              status: 'connected',
              phoneNumber: resolvePhoneNumber(socket?.user?.id)
            })
            return
          }

          if (update.connection === 'close') {
            await handleConnectionUpdate({
              status: 'disconnected',
              errorMessage: toErrorMessage(update.lastDisconnect?.error),
              disconnectReason: resolveDisconnectReason(update.lastDisconnect?.error)
            })
          }
        })()
      })
      socket.ev.on('messages.upsert', ({ messages }) => {
        for (const message of messages) {
          const normalized = normalizeInboundTextMessage(message)
          if (!normalized) {
            continue
          }

          void handleText(normalized)
        }
      })
    },
    async disconnect(reason) {
      socket?.end(reason ? new Error(reason) : undefined)
      socket = null
    },
    async sendMessage(chatId, text) {
      if (!socket) {
        throw new Error('WhatsApp channel is not connected')
      }

      await socket.sendMessage(chatId, { text })
    },
    async resetAuthState() {
      socket?.end(new Error('whatsapp-auth-reset'))
      socket = null
      await rm(authDirectoryPath, { recursive: true, force: true })
    }
  }
}

export class WhatsAppChannel extends AbstractChannel {
  private readonly authStateStore: WhatsAppAuthStateStoreLike
  private readonly clientFactory: (authDirectoryPath: string) => Promise<WhatsAppClientLike>
  private readonly now: () => Date
  private readonly generateCode: () => string
  private readonly reconnectDelayMs: number
  private client: WhatsAppClientLike | null = null
  private started = false
  private stopping = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private generation = 0

  constructor(private readonly options: WhatsAppChannelOptions) {
    super(options.id, 'whatsapp')

    this.authStateStore = options.authStateStore
    this.clientFactory = options.clientFactory ?? createWhatsAppClient
    this.now = options.now ?? (() => new Date())
    this.generateCode = options.generateCode ?? defaultGenerateCode
    this.reconnectDelayMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true
    this.stopping = false
    this.authStateStore.setConnecting(this.id)
    void this.initializeClient()
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.started = false
    this.stopping = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    const activeClient = this.client
    this.client = null
    this.generation += 1

    if (activeClient) {
      await activeClient.disconnect('whatsapp-channel-stopped')
    }

    this.authStateStore.setDisconnected(this.id)
  }

  async send(remoteChatId: string, message: string): Promise<void> {
    if (!this.client) {
      throw new Error('WhatsApp channel is not connected')
    }

    await this.client.sendMessage(remoteChatId, message)
  }

  private async initializeClient(): Promise<void> {
    const generation = ++this.generation

    try {
      const client = await this.clientFactory(this.options.authDirectoryPath)
      if (!this.started || this.stopping || generation !== this.generation) {
        await client.disconnect('whatsapp-channel-stale')
        return
      }

      this.client = client
      client.onConnectionUpdate((update) => this.handleConnectionUpdate(update, generation))
      client.onText(async (message) => {
        if (generation !== this.generation || this.stopping) {
          return
        }

        await this.handleInboundMessage(message)
      })

      await client.connect()
    } catch (error) {
      this.authStateStore.setError(this.id, toErrorMessage(error))
      await this.options.onFatalError?.(error)
      if (!this.stopping && this.started) {
        this.scheduleReconnect()
      }
    }
  }

  private async handleConnectionUpdate(
    update: WhatsAppConnectionUpdate,
    generation: number
  ): Promise<void> {
    if (generation !== this.generation || this.stopping) {
      return
    }

    if (update.status === 'connecting') {
      this.authStateStore.setConnecting(this.id)
      return
    }

    if (update.status === 'qr_ready') {
      this.authStateStore.setQrCode(this.id, {
        qrCodeValue: update.qrCodeValue,
        qrCodeDataUrl: update.qrCodeDataUrl
      })
      return
    }

    if (update.status === 'connected') {
      this.authStateStore.setConnected(this.id, update.phoneNumber)
      return
    }

    if (update.status === 'error') {
      this.authStateStore.setError(this.id, update.errorMessage)
      await this.options.onFatalError?.(new Error(update.errorMessage))
      return
    }

    this.authStateStore.setDisconnected(this.id)

    if (!this.started || this.stopping) {
      return
    }

    const activeClient = this.client
    this.client = null
    if (update.disconnectReason === DisconnectReason.loggedOut && activeClient) {
      await activeClient.resetAuthState()
    }

    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.started || this.stopping) {
        return
      }

      this.authStateStore.setConnecting(this.id)
      void this.initializeClient()
    }, this.reconnectDelayMs)
  }

  private async reply(chatId: string, text: string): Promise<void> {
    const activeClient = this.client
    if (!activeClient) {
      return
    }

    await activeClient.sendMessage(chatId, text)
  }

  private async handleInboundMessage(message: WhatsAppInboundTextMessage): Promise<void> {
    const now = this.now()
    const nowIso = now.toISOString()
    const pairing = await this.options.pairingsRepo.getByChannelAndSender(
      this.id,
      message.chatId,
      message.senderId
    )

    if (pairing?.status === 'approved') {
      void this.emitApprovedMessage(message).catch((error) => {
        console.error(`[WhatsAppChannel] Failed to process inbound message ${message.id}:`, error)
      })
      return
    }

    if (pairing?.status === 'rejected' || pairing?.status === 'revoked') {
      await this.reply(message.chatId, createBlockedReply())
      return
    }

    if (pairing?.status === 'pending' && isActivePending(pairing.expiresAt, nowIso)) {
      await this.reply(message.chatId, createPairingReply(pairing.code))
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

    await this.reply(message.chatId, createPairingReply(createdPairing.code))
  }

  private async emitApprovedMessage(message: WhatsAppInboundTextMessage): Promise<void> {
    const normalized: ChannelMessage = {
      id: message.id,
      remoteChatId: message.chatId,
      senderId: message.senderId,
      content: message.text,
      timestamp: message.timestamp,
      metadata: {
        whatsappChatId: message.chatId,
        whatsappMessageId: message.id,
        whatsappPhoneNumber: resolvePhoneNumber(message.senderId),
        whatsappDisplayName: message.senderDisplayName
      }
    }

    await this.emitMessage(normalized)
  }
}
