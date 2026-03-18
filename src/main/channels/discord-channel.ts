import { basename } from 'node:path'
import { readFile } from 'node:fs/promises'
import { AttachmentBuilder, Client, GatewayIntentBits, Partials } from 'discord.js'
import { AbstractChannel } from './abstract-channel'
import type { ChannelMessage } from './types'
import { logger } from '../utils/logger'

export type DiscordInboundTextMessage = {
  id: string
  channelId: string
  chatType: 'dm' | 'guild'
  guildId: string | null
  senderId: string
  senderUsername: string | null
  senderDisplayName: string
  text: string
  timestamp: Date
  isBotMentioned: boolean
}

export type DiscordClientLike = {
  onText(handler: (message: DiscordInboundTextMessage) => Promise<void>): void
  onError(handler: (error: Error) => Promise<void> | void): void
  connect(): Promise<void>
  disconnect(reason?: string): Promise<void>
  sendMessage(channelId: string, text: string): Promise<void>
  sendImage(channelId: string, filePath: string): Promise<void>
  sendFile(channelId: string, filePath: string, fileName: string): Promise<void>
}

export type DiscordChannelOptions = {
  id: string
  botToken: string
  groupRequireMention?: boolean
  client?: DiscordClientLike
  clientFactory?: (botToken: string) => Promise<DiscordClientLike>
  onFatalError?: (error: unknown) => Promise<void> | void
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(typeof error === 'string' ? error : 'Unknown error')
}

function assertSendableChannel(
  channel: unknown,
  channelId: string
): asserts channel is { send(payload: unknown): Promise<unknown> } {
  if (
    !channel ||
    typeof channel !== 'object' ||
    !('send' in channel) ||
    typeof (channel as { send?: unknown }).send !== 'function'
  ) {
    throw new Error(`Discord channel ${channelId} is not sendable.`)
  }
}

function buildSenderDisplayName(message: {
  member?: { displayName?: string | null } | null
  author: { globalName?: string | null; username?: string | null }
}): string {
  const displayName = message.member?.displayName?.trim()
  if (displayName && displayName.length > 0) {
    return displayName
  }

  const globalName = message.author.globalName?.trim()
  if (globalName && globalName.length > 0) {
    return globalName
  }

  return message.author.username?.trim() ?? ''
}

async function createDiscordClient(botToken: string): Promise<DiscordClientLike> {
  let handleText: (message: DiscordInboundTextMessage) => Promise<void> = async () => undefined
  let handleError: (error: Error) => Promise<void> | void = () => undefined

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  })

  client.on('messageCreate', (message) => {
    if (message.author.bot) {
      return
    }

    const text = message.content.trim()
    if (text.length === 0) {
      return
    }

    const botUserId = client.user?.id ?? ''
    const normalized: DiscordInboundTextMessage = {
      id: message.id,
      channelId: message.channelId,
      chatType: message.guildId ? 'guild' : 'dm',
      guildId: message.guildId ?? null,
      senderId: message.author.id,
      senderUsername: message.author.username ?? null,
      senderDisplayName: buildSenderDisplayName(message),
      text,
      timestamp: message.createdAt,
      isBotMentioned: botUserId.length > 0 ? message.mentions.users.has(botUserId) : false
    }

    void handleText(normalized).catch(() => undefined)
  })

  client.on('error', (error) => {
    void Promise.resolve(handleError(toError(error))).catch(() => undefined)
  })

  async function sendAttachment(
    channelId: string,
    filePath: string,
    fileName: string
  ): Promise<void> {
    const channel = await client.channels.fetch(channelId)
    assertSendableChannel(channel, channelId)

    const fileBuffer = await readFile(filePath)
    await channel.send({
      files: [new AttachmentBuilder(fileBuffer, { name: fileName })]
    })
  }

  return {
    onText(handler) {
      handleText = handler
    },
    onError(handler) {
      handleError = handler
    },
    async connect() {
      await new Promise<void>((resolve, reject) => {
        let settled = false

        const cleanup = () => {
          client.off('ready', onReady)
          client.off('error', onStartupError)
        }

        const finish = (callback: () => void) => {
          if (settled) {
            return
          }

          settled = true
          cleanup()
          callback()
        }

        const onReady = () => {
          finish(() => resolve())
        }

        const onStartupError = (error: Error) => {
          finish(() => reject(error))
        }

        client.once('ready', onReady)
        client.once('error', onStartupError)

        void client.login(botToken).catch((error) => {
          finish(() => reject(toError(error)))
        })
      })
    },
    async disconnect() {
      client.destroy()
    },
    async sendMessage(channelId, text) {
      const channel = await client.channels.fetch(channelId)
      assertSendableChannel(channel, channelId)
      await channel.send({
        content: text
      })
    },
    async sendImage(channelId, filePath) {
      await sendAttachment(channelId, filePath, basename(filePath))
    },
    async sendFile(channelId, filePath, fileName) {
      await sendAttachment(channelId, filePath, fileName)
    }
  }
}

export class DiscordChannel extends AbstractChannel {
  private readonly clientFactory: (botToken: string) => Promise<DiscordClientLike>
  private readonly groupRequireMention: boolean
  private client: DiscordClientLike | null = null
  private started = false
  private stopping = false

  constructor(private readonly options: DiscordChannelOptions) {
    super(options.id, 'discord')

    this.clientFactory = options.client
      ? async () => options.client as DiscordClientLike
      : (options.clientFactory ?? createDiscordClient)
    this.groupRequireMention = options.groupRequireMention ?? true
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.stopping = false
    const client = await this.clientFactory(this.options.botToken)
    this.client = client
    client.onText(async (message) => {
      await this.handleInboundMessage(message)
    })
    client.onError((error) => {
      if (this.stopping) {
        return
      }

      void Promise.resolve(this.options.onFatalError?.(error)).catch((handlerError) => {
        logger.error('[DiscordChannel] Failed to handle fatal error:', handlerError)
      })
    })
    this.started = true

    try {
      await client.connect()
    } catch (error) {
      this.started = false
      this.client = null
      throw error
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.stopping = true
    const activeClient = this.client
    this.client = null
    this.started = false

    await activeClient?.disconnect('discord-channel-stopped')
  }

  async send(remoteChatId: string, message: string): Promise<void> {
    if (!this.client) {
      throw new Error('Discord channel is not connected')
    }

    await this.client.sendMessage(remoteChatId, message)
  }

  async sendImage(remoteChatId: string, filePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('Discord channel is not connected')
    }

    await this.client.sendImage(remoteChatId, filePath)
  }

  async sendFile(remoteChatId: string, filePath: string, fileName: string): Promise<void> {
    if (!this.client) {
      throw new Error('Discord channel is not connected')
    }

    await this.client.sendFile(remoteChatId, filePath, fileName)
  }

  private async handleInboundMessage(message: DiscordInboundTextMessage): Promise<void> {
    const normalized = this.toChannelMessage(message)
    if (!normalized) {
      return
    }

    void this.emitMessage(normalized).catch((error) => {
      logger.error(`[DiscordChannel] Failed to process inbound message ${message.id}:`, error)
    })
  }

  private toChannelMessage(message: DiscordInboundTextMessage): ChannelMessage | null {
    const content = message.text.trim()
    if (content.length === 0) {
      return null
    }

    if (message.chatType === 'guild' && this.groupRequireMention && !message.isBotMentioned) {
      return null
    }

    return {
      id: message.id,
      remoteChatId: message.channelId,
      senderId: message.senderId,
      content,
      timestamp: message.timestamp,
      metadata: {
        discordChannelId: message.channelId,
        discordChannelType: message.chatType,
        discordGuildId: message.guildId,
        discordIsBotMentioned: message.chatType === 'guild' ? message.isBotMentioned : true,
        discordMessageId: message.id,
        discordUsername: message.senderUsername,
        discordDisplayName: message.senderDisplayName
      }
    }
  }
}
