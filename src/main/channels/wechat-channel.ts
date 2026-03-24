import { randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as QRCode from 'qrcode'
import { logger } from '../utils/logger'
import { AbstractChannel } from './abstract-channel'
import type { ChannelMessage } from './types'

const DEFAULT_WECHAT_API_BASE_URL = 'https://ilinkai.weixin.qq.com'
const CHANNEL_VERSION = '1.0.0'
const DEFAULT_LONG_POLL_TIMEOUT_MS = 25_000
const DEFAULT_API_TIMEOUT_MS = 15_000
const DEFAULT_CONFIG_TIMEOUT_MS = 15_000
const DEFAULT_QR_POLL_TIMEOUT_MS = 35_000
const DEFAULT_RECONNECT_DELAY_MS = 5_000
const DEFAULT_QR_TTL_MS = 5 * 60_000

type WechatAccountData = {
  botToken: string
  botId: string
  userId: string
  baseUrl: string
  savedAt: number
}

type WechatQrLoginState = {
  qrcode: string
  qrcodeUrl: string
  createdAt: number
}

type WechatRuntimeState = {
  updatesBuf: string
  contextTokens: Record<string, string>
  lastMessageId: number
}

type WechatMessageItem = {
  type?: number
  msg_id?: string
  text_item?: {
    text?: string
  }
  voice_item?: {
    text?: string
  }
  file_item?: {
    file_name?: string
  }
}

type WechatReferenceMessage = {
  message_item?: WechatMessageItem
  title?: string
}

type WechatInboundMessage = {
  seq?: number
  message_id?: number
  from_user_id?: string
  to_user_id?: string
  client_id?: string
  create_time_ms?: number
  message_type?: number
  message_state?: number
  item_list?: WechatMessageItem[]
  ref_msg?: WechatReferenceMessage
  context_token?: string
}

type WechatUpdatesResponse = {
  ret?: number
  errcode?: number
  errmsg?: string
  msgs?: WechatInboundMessage[]
  get_updates_buf?: string
}

type WechatSendMessageRequest = {
  msg?: {
    from_user_id?: string
    to_user_id?: string
    client_id?: string
    message_type?: number
    message_state?: number
    item_list?: Array<{
      type?: number
      text_item?: {
        text?: string
      }
    }>
    context_token?: string
  }
}

type WechatTypingRequest = {
  ilink_user_id?: string
  typing_ticket?: string
  status?: number
}

type WechatQrCodeResponse = {
  qrcode: string
  qrcode_img_content: string
}

type WechatQrStatusResponse = {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired'
  bot_token?: string
  ilink_bot_id?: string
  baseurl?: string
  ilink_user_id?: string
}

type WechatConfigResponse = {
  ret?: number
  errmsg?: string
  typing_ticket?: string
}

type WechatApiLike = {
  fetchQRCode(apiBaseUrl: string, signal?: AbortSignal): Promise<WechatQrCodeResponse>
  pollQRStatus(
    apiBaseUrl: string,
    qrcode: string,
    signal?: AbortSignal
  ): Promise<WechatQrStatusResponse>
  getUpdates(input: {
    baseUrl: string
    token: string
    updatesBuf?: string
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<WechatUpdatesResponse>
  getConfig(input: {
    baseUrl: string
    token: string
    ilinkUserId: string
    contextToken?: string
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<WechatConfigResponse>
  sendMessage(input: {
    baseUrl: string
    token: string
    body: WechatSendMessageRequest
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<void>
  sendTyping(input: {
    baseUrl: string
    token: string
    body: WechatTypingRequest
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<void>
}

type WechatAuthStateStoreLike = {
  setConnecting(channelId: string): unknown
  setQrCode(channelId: string, input: { qrCodeValue: string; qrCodeDataUrl: string }): unknown
  setConnected(channelId: string, accountId: string | null): unknown
  setDisconnected(channelId: string): unknown
  setError(channelId: string, errorMessage: string): unknown
}

type WechatChannelStateSnapshot = {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error'
  errorMessage: string | null
}

export type WechatChannelOptions = {
  id: string
  dataDirectoryPath: string
  authStateStore: WechatAuthStateStoreLike
  apiBaseUrl?: string
  api?: WechatApiLike
  now?: () => Date
  qrcodeToDataUrl?: (value: string) => Promise<string>
  longPollTimeoutMs?: number
  qrTtlMs?: number
  reconnectDelayMs?: number
  onFatalError?: (error: unknown) => Promise<void> | void
  onStateChange?: (state: WechatChannelStateSnapshot) => Promise<void> | void
}

class WechatChannelAbortedError extends Error {
  constructor() {
    super('Wechat channel request aborted')
    this.name = 'WechatChannelAbortedError'
  }
}

function isWechatChannelAbortedError(error: unknown): boolean {
  return error instanceof WechatChannelAbortedError
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return typeof error === 'string' ? error : 'Unknown error'
}

function isAuthenticationError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase()
  return (
    message.includes(' 401:') ||
    message.includes(' 403:') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  )
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function buildBaseInfo(): { channel_version: string } {
  return {
    channel_version: CHANNEL_VERSION
  }
}

function randomWechatUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0)
  return Buffer.from(String(uint32), 'utf-8').toString('base64')
}

function buildHeaders(input: { token?: string; body: string }): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'Content-Length': String(Buffer.byteLength(input.body, 'utf-8')),
    'X-WECHAT-UIN': randomWechatUin()
  }

  if (input.token?.trim()) {
    headers.Authorization = `Bearer ${input.token.trim()}`
  }

  return headers
}

function createDefaultRuntimeState(): WechatRuntimeState {
  return {
    updatesBuf: '',
    contextTokens: {},
    lastMessageId: 0
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function accountFilePath(dataDirectoryPath: string): string {
  return join(dataDirectoryPath, 'account.json')
}

function stateFilePath(dataDirectoryPath: string): string {
  return join(dataDirectoryPath, 'state.json')
}

function qrStateFilePath(dataDirectoryPath: string): string {
  return join(dataDirectoryPath, 'qr-login.json')
}

async function loadWechatAccount(dataDirectoryPath: string): Promise<WechatAccountData | null> {
  return readJsonFile<WechatAccountData>(accountFilePath(dataDirectoryPath))
}

async function saveWechatAccount(
  dataDirectoryPath: string,
  account: WechatAccountData
): Promise<void> {
  await mkdir(dataDirectoryPath, { recursive: true })
  await writeFile(accountFilePath(dataDirectoryPath), JSON.stringify(account, null, 2), 'utf-8')
}

async function clearWechatAccount(dataDirectoryPath: string): Promise<void> {
  await unlink(accountFilePath(dataDirectoryPath)).catch(() => undefined)
}

async function loadWechatRuntimeState(dataDirectoryPath: string): Promise<WechatRuntimeState> {
  return (await readJsonFile<WechatRuntimeState>(stateFilePath(dataDirectoryPath))) ?? createDefaultRuntimeState()
}

async function saveWechatRuntimeState(
  dataDirectoryPath: string,
  state: WechatRuntimeState
): Promise<void> {
  await mkdir(dataDirectoryPath, { recursive: true })
  await writeFile(stateFilePath(dataDirectoryPath), JSON.stringify(state, null, 2), 'utf-8')
}

async function resetWechatRuntimeState(dataDirectoryPath: string): Promise<void> {
  await saveWechatRuntimeState(dataDirectoryPath, createDefaultRuntimeState())
}

async function loadWechatQrState(dataDirectoryPath: string): Promise<WechatQrLoginState | null> {
  return readJsonFile<WechatQrLoginState>(qrStateFilePath(dataDirectoryPath))
}

async function saveWechatQrState(
  dataDirectoryPath: string,
  state: WechatQrLoginState
): Promise<void> {
  await mkdir(dataDirectoryPath, { recursive: true })
  await writeFile(qrStateFilePath(dataDirectoryPath), JSON.stringify(state, null, 2), 'utf-8')
}

async function clearWechatQrState(dataDirectoryPath: string): Promise<void> {
  await unlink(qrStateFilePath(dataDirectoryPath)).catch(() => undefined)
}

async function fetchJsonWithTimeout<T>(input: {
  url: string
  init?: RequestInit
  timeoutMs: number
  signal?: AbortSignal
  label: string
  onTimeout: () => T
}): Promise<T> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => {
    timeoutController.abort()
  }, input.timeoutMs)
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeoutController.signal])
    : timeoutController.signal

  try {
    const response = await fetch(input.url, {
      ...input.init,
      signal
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)')
      throw new Error(`${input.label} ${response.status}: ${body}`)
    }

    return (await response.json()) as T
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      if (input.signal?.aborted) {
        throw new WechatChannelAbortedError()
      }

      return input.onTimeout()
    }

    throw error
  }
}

async function defaultFetchQRCode(
  apiBaseUrl: string,
  signal?: AbortSignal
): Promise<WechatQrCodeResponse> {
  const url = new URL('ilink/bot/get_bot_qrcode?bot_type=3', ensureTrailingSlash(apiBaseUrl))
  return fetchJsonWithTimeout({
    url: url.toString(),
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
    signal,
    label: 'fetchQRCode',
    onTimeout: () => {
      throw new Error('fetchQRCode timed out')
    }
  })
}

async function defaultPollQRStatus(
  apiBaseUrl: string,
  qrcode: string,
  signal?: AbortSignal
): Promise<WechatQrStatusResponse> {
  const url = new URL(
    `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
    ensureTrailingSlash(apiBaseUrl)
  )

  return fetchJsonWithTimeout({
    url: url.toString(),
    timeoutMs: DEFAULT_QR_POLL_TIMEOUT_MS,
    signal,
    label: 'pollQRStatus',
    init: {
      headers: {
        'iLink-App-ClientVersion': '1'
      }
    },
    onTimeout: () => ({ status: 'wait' })
  })
}

async function postWechatApi<T>(input: {
  baseUrl: string
  endpoint: string
  body: string
  token?: string
  timeoutMs: number
  signal?: AbortSignal
  label: string
  onTimeout: () => T
}): Promise<T> {
  const url = new URL(input.endpoint, ensureTrailingSlash(input.baseUrl))

  return fetchJsonWithTimeout({
    url: url.toString(),
    timeoutMs: input.timeoutMs,
    signal: input.signal,
    label: input.label,
    init: {
      method: 'POST',
      headers: buildHeaders({
        token: input.token,
        body: input.body
      }),
      body: input.body
    },
    onTimeout: input.onTimeout
  })
}

async function postWechatText(input: {
  baseUrl: string
  endpoint: string
  body: string
  token?: string
  timeoutMs: number
  signal?: AbortSignal
  label: string
}): Promise<string> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => {
    timeoutController.abort()
  }, input.timeoutMs)
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeoutController.signal])
    : timeoutController.signal
  const url = new URL(input.endpoint, ensureTrailingSlash(input.baseUrl))

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: buildHeaders({
        token: input.token,
        body: input.body
      }),
      body: input.body,
      signal
    })
    clearTimeout(timeoutId)

    const rawText = await response.text()
    if (!response.ok) {
      throw new Error(`${input.label} ${response.status}: ${rawText}`)
    }

    return rawText
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      if (input.signal?.aborted) {
        throw new WechatChannelAbortedError()
      }

      throw new Error(`${input.label} timed out`)
    }

    throw error
  }
}

async function defaultGetUpdates(input: {
  baseUrl: string
  token: string
  updatesBuf?: string
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<WechatUpdatesResponse> {
  return postWechatApi({
    baseUrl: input.baseUrl,
    endpoint: 'ilink/bot/getupdates',
    body: JSON.stringify({
      get_updates_buf: input.updatesBuf ?? '',
      base_info: buildBaseInfo()
    }),
    token: input.token,
    timeoutMs: input.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS,
    signal: input.signal,
    label: 'getUpdates',
    onTimeout: () => ({
      ret: 0,
      msgs: [],
      get_updates_buf: input.updatesBuf
    })
  })
}

async function defaultGetConfig(input: {
  baseUrl: string
  token: string
  ilinkUserId: string
  contextToken?: string
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<WechatConfigResponse> {
  return postWechatApi({
    baseUrl: input.baseUrl,
    endpoint: 'ilink/bot/getconfig',
    body: JSON.stringify({
      ilink_user_id: input.ilinkUserId,
      context_token: input.contextToken,
      base_info: buildBaseInfo()
    }),
    token: input.token,
    timeoutMs: input.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    signal: input.signal,
    label: 'getConfig',
    onTimeout: () => {
      throw new Error('getConfig timed out')
    }
  })
}

async function defaultSendMessage(input: {
  baseUrl: string
  token: string
  body: WechatSendMessageRequest
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<void> {
  await postWechatText({
    baseUrl: input.baseUrl,
    endpoint: 'ilink/bot/sendmessage',
    body: JSON.stringify({
      ...input.body,
      base_info: buildBaseInfo()
    }),
    token: input.token,
    timeoutMs: input.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    signal: input.signal,
    label: 'sendMessage'
  })
}

async function defaultSendTyping(input: {
  baseUrl: string
  token: string
  body: WechatTypingRequest
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<void> {
  await postWechatText({
    baseUrl: input.baseUrl,
    endpoint: 'ilink/bot/sendtyping',
    body: JSON.stringify({
      ...input.body,
      base_info: buildBaseInfo()
    }),
    token: input.token,
    timeoutMs: input.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    signal: input.signal,
    label: 'sendTyping'
  })
}

const defaultWechatApi: WechatApiLike = {
  fetchQRCode: defaultFetchQRCode,
  pollQRStatus: defaultPollQRStatus,
  getUpdates: defaultGetUpdates,
  getConfig: defaultGetConfig,
  sendMessage: defaultSendMessage,
  sendTyping: defaultSendTyping
}

function buildContextTokenKey(botId: string, userId: string): string {
  return `${botId}:${userId}`
}

function isQrFresh(qrState: WechatQrLoginState, now: Date, qrTtlMs: number): boolean {
  return now.getTime() - qrState.createdAt < qrTtlMs
}

function createWechatClientId(): string {
  return `wechat:${Date.now()}-${randomBytes(4).toString('hex')}`
}

function formatWechatMessageContent(message: WechatInboundMessage): string | null {
  const textParts: string[] = []

  for (const item of message.item_list ?? []) {
    switch (item.type) {
      case 1:
        textParts.push(item.text_item?.text ?? '')
        break
      case 2:
        textParts.push('[Image]')
        break
      case 3:
        textParts.push(item.voice_item?.text ? `[Voice: ${item.voice_item.text}]` : '[Voice]')
        break
      case 4:
        textParts.push(item.file_item?.file_name ? `[File: ${item.file_item.file_name}]` : '[File]')
        break
      case 5:
        textParts.push('[Video]')
        break
      default:
        break
    }
  }

  let content = textParts.join('\n').trim()
  if (message.ref_msg) {
    const replyText =
      message.ref_msg.message_item?.text_item?.text?.trim() ?? message.ref_msg.title?.trim() ?? ''
    if (replyText.length > 0) {
      content = `[Reply to: ${replyText}]\n${content}`.trim()
    }
  }

  return content.length > 0 ? content : null
}

function toTimestamp(value: number | undefined): Date {
  if (!Number.isFinite(value)) {
    return new Date()
  }

  const timestamp = new Date(Number(value))
  return Number.isNaN(timestamp.getTime()) ? new Date() : timestamp
}

function toChannelMessage(message: WechatInboundMessage): ChannelMessage | null {
  const remoteChatId = typeof message.from_user_id === 'string' ? message.from_user_id.trim() : ''
  const content = formatWechatMessageContent(message)

  if (remoteChatId.length === 0 || !content) {
    return null
  }

  return {
    id: String(message.message_id ?? createWechatClientId()),
    remoteChatId,
    senderId: remoteChatId,
    content,
    timestamp: toTimestamp(message.create_time_ms),
    metadata: {
      wechatMessageId: message.message_id ?? null,
      wechatFromUserId: message.from_user_id ?? null,
      wechatToUserId: message.to_user_id ?? null,
      wechatClientId: message.client_id ?? null,
      wechatContextToken: message.context_token ?? null,
      wechatItemTypes: (message.item_list ?? []).map((item) => item.type ?? 0)
    }
  }
}

export class WechatChannel extends AbstractChannel {
  private readonly authStateStore: WechatAuthStateStoreLike
  private readonly apiBaseUrl: string
  private readonly api: WechatApiLike
  private readonly now: () => Date
  private readonly qrcodeToDataUrl: (value: string) => Promise<string>
  private readonly longPollTimeoutMs: number
  private readonly qrTtlMs: number
  private readonly reconnectDelayMs: number

  private started = false
  private stopping = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private activeAbortController: AbortController | null = null
  private generation = 0
  private lastPublishedState: string | null = null
  private runtimeState: WechatRuntimeState | null = null

  constructor(private readonly options: WechatChannelOptions) {
    super(options.id, 'wechat')

    this.authStateStore = options.authStateStore
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_WECHAT_API_BASE_URL
    this.api = options.api ?? defaultWechatApi
    this.now = options.now ?? (() => new Date())
    this.qrcodeToDataUrl = options.qrcodeToDataUrl ?? ((value) => QRCode.toDataURL(value))
    this.longPollTimeoutMs = options.longPollTimeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS
    this.qrTtlMs = options.qrTtlMs ?? DEFAULT_QR_TTL_MS
    this.reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true
    this.stopping = false
    this.clearReconnectTimer()
    this.authStateStore.setConnecting(this.id)
    this.publishState({
      status: 'connecting',
      errorMessage: null
    })
    void this.initialize()
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.started = false
    this.stopping = true
    this.generation += 1
    this.clearReconnectTimer()
    this.activeAbortController?.abort()
    this.activeAbortController = null
    this.authStateStore.setDisconnected(this.id)
    this.publishState({
      status: 'disconnected',
      errorMessage: null
    })
  }

  async send(remoteChatId: string, message: string): Promise<void> {
    const account = await loadWechatAccount(this.options.dataDirectoryPath)
    if (!account) {
      throw new Error('Wechat channel is not authenticated')
    }

    const content = message.trim()
    if (content.length === 0) {
      return
    }

    const runtimeState = await this.getRuntimeState()
    const contextToken = runtimeState.contextTokens[buildContextTokenKey(account.botId, remoteChatId)]

    try {
      await this.api.sendMessage({
        baseUrl: account.baseUrl,
        token: account.botToken,
        body: {
          msg: {
            from_user_id: '',
            to_user_id: remoteChatId,
            client_id: createWechatClientId(),
            message_type: 2,
            message_state: 2,
            item_list: [
              {
                type: 1,
                text_item: {
                  text: content
                }
              }
            ],
            context_token: contextToken
          }
        }
      })
    } finally {
      if (contextToken) {
        void this.sendTypingStatus({
          account,
          remoteChatId,
          contextToken,
          status: 'cancel'
        }).catch((error) => {
          if (isWechatChannelAbortedError(error)) {
            return
          }

          logger.warn(`[WechatChannel:${this.id}] Failed to clear typing indicator:`, error)
        })
      }
    }
  }

  private async initialize(): Promise<void> {
    const generation = ++this.generation
    const abortController = new AbortController()
    this.activeAbortController?.abort()
    this.activeAbortController = abortController

    try {
      const account = await this.ensureAuthenticated(generation, abortController.signal)
      if (!account || !this.isGenerationActive(generation)) {
        return
      }

      await this.pollMessages(account, generation, abortController.signal)
    } catch (error) {
      if (isWechatChannelAbortedError(error) || !this.isGenerationActive(generation)) {
        return
      }

      if (isAuthenticationError(error)) {
        await this.clearStoredSession()
        this.authStateStore.setDisconnected(this.id)
        this.publishState({
          status: 'disconnected',
          errorMessage: null
        })
      } else {
        const errorMessage = toErrorMessage(error)
        this.authStateStore.setError(this.id, errorMessage)
        this.publishState({
          status: 'error',
          errorMessage
        })
      }

      await this.options.onFatalError?.(error)

      if (this.started && !this.stopping) {
        this.scheduleReconnect()
      }
    } finally {
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null
      }
    }
  }

  private async ensureAuthenticated(
    generation: number,
    signal: AbortSignal
  ): Promise<WechatAccountData | null> {
    const existingAccount = await loadWechatAccount(this.options.dataDirectoryPath)
    if (existingAccount) {
      this.authStateStore.setConnected(this.id, existingAccount.userId)
      this.publishState({
        status: 'connected',
        errorMessage: null
      })
      return existingAccount
    }

    while (this.isGenerationActive(generation)) {
      const qrState = await this.ensureFreshQrState(signal)
      const qrCodeDataUrl = await this.qrcodeToDataUrl(qrState.qrcodeUrl)

      if (!this.isGenerationActive(generation)) {
        return null
      }

      this.authStateStore.setQrCode(this.id, {
        qrCodeValue: qrState.qrcodeUrl,
        qrCodeDataUrl
      })
      this.publishState({
        status: 'qr_ready',
        errorMessage: null
      })

      while (this.isGenerationActive(generation)) {
        const qrStatus = await this.api.pollQRStatus(this.apiBaseUrl, qrState.qrcode, signal)
        if (!this.isGenerationActive(generation)) {
          return null
        }

        if (qrStatus.status === 'confirmed') {
          if (!qrStatus.bot_token || !qrStatus.ilink_bot_id || !qrStatus.ilink_user_id) {
            throw new Error('Wechat login confirmed but the server returned incomplete account data')
          }

          const account: WechatAccountData = {
            botToken: qrStatus.bot_token,
            botId: qrStatus.ilink_bot_id,
            userId: qrStatus.ilink_user_id,
            baseUrl: qrStatus.baseurl ?? this.apiBaseUrl,
            savedAt: this.now().getTime()
          }

          await saveWechatAccount(this.options.dataDirectoryPath, account)
          await clearWechatQrState(this.options.dataDirectoryPath)
          this.authStateStore.setConnected(this.id, account.userId)
          this.publishState({
            status: 'connected',
            errorMessage: null
          })
          return account
        }

        if (qrStatus.status === 'expired') {
          await clearWechatQrState(this.options.dataDirectoryPath)
          break
        }
      }
    }

    return null
  }

  private async ensureFreshQrState(signal: AbortSignal): Promise<WechatQrLoginState> {
    const existingQrState = await loadWechatQrState(this.options.dataDirectoryPath)
    if (existingQrState && isQrFresh(existingQrState, this.now(), this.qrTtlMs)) {
      return existingQrState
    }

    const qrResponse = await this.api.fetchQRCode(this.apiBaseUrl, signal)
    const nextState: WechatQrLoginState = {
      qrcode: qrResponse.qrcode,
      qrcodeUrl: qrResponse.qrcode_img_content,
      createdAt: this.now().getTime()
    }

    await saveWechatQrState(this.options.dataDirectoryPath, nextState)
    return nextState
  }

  private async pollMessages(
    account: WechatAccountData,
    generation: number,
    signal: AbortSignal
  ): Promise<void> {
    const runtimeState = await this.getRuntimeState()

    while (this.isGenerationActive(generation)) {
      const response = await this.api.getUpdates({
        baseUrl: account.baseUrl,
        token: account.botToken,
        updatesBuf: runtimeState.updatesBuf,
        timeoutMs: this.longPollTimeoutMs,
        signal
      })

      if (response.errcode) {
        throw new Error(
          `Wechat getupdates failed: errcode=${response.errcode} errmsg=${response.errmsg ?? 'unknown'}`
        )
      }

      if (typeof response.get_updates_buf === 'string') {
        runtimeState.updatesBuf = response.get_updates_buf
      }

      const inboundMessages =
        response.msgs?.filter(
          (message) =>
            message.message_type === 1 &&
            typeof message.message_id === 'number' &&
            message.message_id > runtimeState.lastMessageId
        ) ?? []

      if (inboundMessages.length > 0) {
        runtimeState.lastMessageId = Math.max(
          runtimeState.lastMessageId,
          ...inboundMessages.map((message) => message.message_id ?? 0)
        )

        for (const message of inboundMessages) {
          if (typeof message.from_user_id === 'string' && typeof message.context_token === 'string') {
            runtimeState.contextTokens[buildContextTokenKey(account.botId, message.from_user_id)] =
              message.context_token
          }
        }
      }

      await saveWechatRuntimeState(this.options.dataDirectoryPath, runtimeState)

      for (const message of inboundMessages) {
        if (!this.isGenerationActive(generation)) {
          return
        }

        if (typeof message.from_user_id === 'string') {
          const contextToken =
            typeof message.context_token === 'string'
              ? message.context_token
              : runtimeState.contextTokens[buildContextTokenKey(account.botId, message.from_user_id)]

          void this.sendTypingStatus({
            account,
            remoteChatId: message.from_user_id,
            contextToken,
            status: 'typing',
            signal
          }).catch((error) => {
            if (isWechatChannelAbortedError(error)) {
              return
            }

            logger.warn(`[WechatChannel:${this.id}] Failed to send typing indicator:`, error)
          })
        }

        const normalized = toChannelMessage(message)
        if (!normalized) {
          continue
        }

        void this.emitMessage(normalized).catch((error) => {
          logger.error(
            `[WechatChannel:${this.id}] Failed to process inbound message ${normalized.id}:`,
            error
          )
        })
      }
    }
  }

  private async sendTypingStatus(input: {
    account: WechatAccountData
    remoteChatId: string
    contextToken?: string
    status: 'typing' | 'cancel'
    signal?: AbortSignal
  }): Promise<void> {
    const remoteChatId = input.remoteChatId.trim()
    const contextToken = input.contextToken?.trim()

    if (remoteChatId.length === 0 || !contextToken) {
      return
    }

    const config = await this.api.getConfig({
      baseUrl: input.account.baseUrl,
      token: input.account.botToken,
      ilinkUserId: remoteChatId,
      contextToken,
      signal: input.signal
    })

    if (typeof config.errmsg === 'string' && config.errmsg.trim().length > 0) {
      throw new Error(`Wechat getconfig failed: ${config.errmsg}`)
    }

    const typingTicket = config.typing_ticket?.trim()
    if (!typingTicket) {
      return
    }

    await this.api.sendTyping({
      baseUrl: input.account.baseUrl,
      token: input.account.botToken,
      body: {
        ilink_user_id: remoteChatId,
        typing_ticket: typingTicket,
        status: input.status === 'typing' ? 1 : 2
      },
      signal: input.signal
    })
  }

  private async clearStoredSession(): Promise<void> {
    this.runtimeState = createDefaultRuntimeState()

    await Promise.all([
      clearWechatAccount(this.options.dataDirectoryPath),
      clearWechatQrState(this.options.dataDirectoryPath),
      resetWechatRuntimeState(this.options.dataDirectoryPath)
    ])
  }

  private async getRuntimeState(): Promise<WechatRuntimeState> {
    if (this.runtimeState) {
      return this.runtimeState
    }

    this.runtimeState = await loadWechatRuntimeState(this.options.dataDirectoryPath)
    return this.runtimeState
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.started || this.stopping) {
        return
      }

      this.authStateStore.setConnecting(this.id)
      this.publishState({
        status: 'connecting',
        errorMessage: null
      })
      void this.initialize()
    }, this.reconnectDelayMs)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private isGenerationActive(generation: number): boolean {
    return this.started && !this.stopping && generation === this.generation
  }

  private publishState(state: WechatChannelStateSnapshot): void {
    const signature = JSON.stringify(state)
    if (signature === this.lastPublishedState) {
      return
    }

    this.lastPublishedState = signature
    void this.options.onStateChange?.(state)
  }
}
