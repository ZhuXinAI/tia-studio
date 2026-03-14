import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  AppChannelPairing,
  ChannelPairingStatus
} from '../persistence/repos/channel-pairings-repo'
import { TelegramChannel } from './telegram-channel'

class PairingsRepoStub {
  private readonly pairings = new Map<string, AppChannelPairing>()

  private key(channelId: string, remoteChatId: string, senderId: string): string {
    return `${channelId}:${remoteChatId}:${senderId}`
  }

  setPairing(
    pairing: Pick<
      AppChannelPairing,
      | 'channelId'
      | 'remoteChatId'
      | 'senderId'
      | 'senderDisplayName'
      | 'senderUsername'
      | 'code'
      | 'status'
      | 'expiresAt'
      | 'approvedAt'
      | 'rejectedAt'
      | 'revokedAt'
      | 'lastSeenAt'
    >
  ): AppChannelPairing {
    const stored: AppChannelPairing = {
      id: randomUUID(),
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:00.000Z',
      ...pairing
    }
    this.pairings.set(this.key(pairing.channelId, pairing.remoteChatId, pairing.senderId), stored)
    return stored
  }

  async getByChannelAndSender(
    channelId: string,
    remoteChatId: string,
    senderId: string
  ): Promise<AppChannelPairing | null> {
    return this.pairings.get(this.key(channelId, remoteChatId, senderId)) ?? null
  }

  async countActivePendingByChannelId(channelId: string, now: string): Promise<number> {
    return [...this.pairings.values()].filter((pairing) => {
      return (
        pairing.channelId === channelId &&
        pairing.status === 'pending' &&
        typeof pairing.expiresAt === 'string' &&
        pairing.expiresAt > now
      )
    }).length
  }

  async createOrRefreshPending(input: {
    channelId: string
    remoteChatId: string
    senderId: string
    senderDisplayName: string
    senderUsername?: string | null
    code: string
    expiresAt: string
    lastSeenAt: string
  }): Promise<AppChannelPairing> {
    const existing = await this.getByChannelAndSender(
      input.channelId,
      input.remoteChatId,
      input.senderId
    )

    if (!existing) {
      return this.setPairing({
        channelId: input.channelId,
        remoteChatId: input.remoteChatId,
        senderId: input.senderId,
        senderDisplayName: input.senderDisplayName,
        senderUsername: input.senderUsername ?? null,
        code: input.code,
        status: 'pending',
        expiresAt: input.expiresAt,
        approvedAt: null,
        rejectedAt: null,
        revokedAt: null,
        lastSeenAt: input.lastSeenAt
      })
    }

    const refreshed: AppChannelPairing = {
      ...existing,
      senderDisplayName: input.senderDisplayName,
      senderUsername: input.senderUsername ?? null,
      code: input.code,
      status: 'pending',
      expiresAt: input.expiresAt,
      approvedAt: null,
      rejectedAt: null,
      revokedAt: null,
      lastSeenAt: input.lastSeenAt,
      updatedAt: input.lastSeenAt
    }
    this.pairings.set(this.key(input.channelId, input.remoteChatId, input.senderId), refreshed)

    return refreshed
  }

  list(): AppChannelPairing[] {
    return [...this.pairings.values()]
  }
}

class TelegramClientStub {
  readonly launch = vi.fn(async () => undefined)
  readonly stop = vi.fn((reason?: string) => {
    void reason
    return undefined
  })
  readonly sendMessage = vi.fn(async (chatId: string, text: string) => {
    void chatId
    void text
    return undefined
  })
  readonly sendPhoto = vi.fn(async (chatId: string, filePath: string) => {
    void chatId
    void filePath
    return undefined
  })

  private textHandler:
    | ((message: {
        id: string
        chatId: string
        chatType: string
        senderId: string
        senderUsername: string | null
        senderDisplayName: string
        text: string
        timestamp: Date
        reply: (text: string) => Promise<void>
      }) => Promise<void>)
    | null = null

  onText(
    handler: (message: {
      id: string
      chatId: string
      chatType: string
      senderId: string
      senderUsername: string | null
      senderDisplayName: string
      text: string
      timestamp: Date
      reply: (text: string) => Promise<void>
    }) => Promise<void>
  ): void {
    this.textHandler = handler
  }

  async deliverText(input: {
    id?: string
    chatId: string
    chatType?: string
    senderId: string
    senderUsername?: string | null
    senderDisplayName: string
    text: string
    timestamp?: Date
  }): Promise<void> {
    const replies: string[] = []

    await this.textHandler?.({
      id: input.id ?? 'msg-1',
      chatId: input.chatId,
      chatType: input.chatType ?? 'private',
      senderId: input.senderId,
      senderUsername: input.senderUsername ?? null,
      senderDisplayName: input.senderDisplayName,
      text: input.text,
      timestamp: input.timestamp ?? new Date('2026-03-09T00:00:00.000Z'),
      reply: async (text: string) => {
        replies.push(text)
      }
    })

    this.lastReplies = replies
  }

  lastReplies: string[] = []
}

function createApprovedPairing(
  status: ChannelPairingStatus = 'approved'
): Pick<
  AppChannelPairing,
  | 'channelId'
  | 'remoteChatId'
  | 'senderId'
  | 'senderDisplayName'
  | 'senderUsername'
  | 'code'
  | 'status'
  | 'expiresAt'
  | 'approvedAt'
  | 'rejectedAt'
  | 'revokedAt'
  | 'lastSeenAt'
> {
  return {
    channelId: 'channel-telegram',
    remoteChatId: '1001',
    senderId: '1001',
    senderDisplayName: 'Alice',
    senderUsername: 'alice',
    code: 'AB7KQ2XM',
    status,
    expiresAt: null,
    approvedAt: status === 'approved' ? '2026-03-09T00:05:00.000Z' : null,
    rejectedAt: status === 'rejected' ? '2026-03-09T00:05:00.000Z' : null,
    revokedAt: status === 'revoked' ? '2026-03-09T00:05:00.000Z' : null,
    lastSeenAt: '2026-03-09T00:00:00.000Z'
  }
}

describe('TelegramChannel', () => {
  it('starts and stops the injected Telegram client', async () => {
    const client = new TelegramClientStub()
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo: new PairingsRepoStub()
    })

    await channel.start()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(client.launch).toHaveBeenCalledOnce()
    await channel.stop()
    expect(client.stop).toHaveBeenCalledOnce()
  })

  it('resolves startup without waiting for the polling lifetime promise', async () => {
    const client = new TelegramClientStub()
    client.launch.mockImplementation(() => new Promise(() => undefined))
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo: new PairingsRepoStub()
    })

    await expect(
      Promise.race([
        channel.start().then(() => 'started'),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 0))
      ])
    ).resolves.toBe('started')
  })

  it('sends outbound images back to the same Telegram chat', async () => {
    const client = new TelegramClientStub()
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo: new PairingsRepoStub()
    })

    await channel.sendImage('1001', '/tmp/reply.png')

    expect(client.sendPhoto).toHaveBeenCalledWith('1001', '/tmp/reply.png')
  })

  it('creates a pending pairing for an unknown dm and replies with its code', async () => {
    const client = new TelegramClientStub()
    const pairingsRepo = new PairingsRepoStub()
    const onMessage = vi.fn()
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo,
      generateCode: () => 'AB7KQ2XM',
      now: () => new Date('2026-03-09T00:00:00.000Z')
    })
    channel.onMessage = onMessage

    await channel.start()
    await client.deliverText({
      chatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      text: 'hello'
    })

    expect(onMessage).not.toHaveBeenCalled()
    expect(pairingsRepo.list()).toHaveLength(1)
    expect(pairingsRepo.list()[0]).toMatchObject({
      status: 'pending',
      code: 'AB7KQ2XM'
    })
    expect(client.lastReplies).toHaveLength(1)
    expect(client.lastReplies[0]).toContain('AB7KQ2XM')
  })

  it('reuses an existing unexpired pending pairing without creating another one', async () => {
    const client = new TelegramClientStub()
    const pairingsRepo = new PairingsRepoStub()
    pairingsRepo.setPairing({
      channelId: 'channel-telegram',
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      status: 'pending',
      expiresAt: '2026-03-09T01:00:00.000Z',
      approvedAt: null,
      rejectedAt: null,
      revokedAt: null,
      lastSeenAt: '2026-03-09T00:00:00.000Z'
    })
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo,
      generateCode: () => 'ZZ9YY8XX',
      now: () => new Date('2026-03-09T00:15:00.000Z')
    })

    await channel.start()
    await client.deliverText({
      chatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      text: 'still waiting'
    })

    expect(pairingsRepo.list()).toHaveLength(1)
    expect(pairingsRepo.list()[0]?.code).toBe('AB7KQ2XM')
    expect(client.lastReplies[0]).toContain('AB7KQ2XM')
  })

  it('blocks rejected and revoked users from reaching the assistant', async () => {
    const client = new TelegramClientStub()
    const pairingsRepo = new PairingsRepoStub()
    pairingsRepo.setPairing(createApprovedPairing('rejected'))
    const onMessage = vi.fn()
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo
    })
    channel.onMessage = onMessage

    await channel.start()
    await client.deliverText({
      chatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      text: 'hello again'
    })

    expect(onMessage).not.toHaveBeenCalled()
    expect(client.lastReplies[0]).toContain('not approved')
  })

  it('ignores non-private chats', async () => {
    const client = new TelegramClientStub()
    const pairingsRepo = new PairingsRepoStub()
    const onMessage = vi.fn()
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo
    })
    channel.onMessage = onMessage

    await channel.start()
    await client.deliverText({
      chatId: '-1001',
      chatType: 'group',
      senderId: '1001',
      senderDisplayName: 'Alice',
      text: 'group hello'
    })

    expect(onMessage).not.toHaveBeenCalled()
    expect(client.lastReplies).toHaveLength(0)
  })

  it('still ignores non-private chats when mention gating is disabled', async () => {
    const client = new TelegramClientStub()
    const pairingsRepo = new PairingsRepoStub()
    pairingsRepo.setPairing({
      ...createApprovedPairing(),
      remoteChatId: '-1001',
      senderId: '1001'
    })
    const onMessage = vi.fn()
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo,
      groupRequireMention: false
    })
    channel.onMessage = onMessage

    await channel.start()
    await client.deliverText({
      chatId: '-1001',
      chatType: 'supergroup',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      text: 'hello group anyway'
    })

    expect(onMessage).not.toHaveBeenCalled()
    expect(client.lastReplies).toHaveLength(0)
  })

  it('forwards approved private text messages to the shared channel contract', async () => {
    const client = new TelegramClientStub()
    const pairingsRepo = new PairingsRepoStub()
    pairingsRepo.setPairing(createApprovedPairing())
    const onMessage = vi.fn()
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo
    })
    channel.onMessage = onMessage

    await channel.start()
    await client.deliverText({
      id: '42',
      chatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      text: 'hello from telegram',
      timestamp: new Date('2026-03-09T00:10:00.000Z')
    })

    expect(onMessage).toHaveBeenCalledWith({
      id: '42',
      remoteChatId: '1001',
      senderId: '1001',
      content: 'hello from telegram',
      timestamp: new Date('2026-03-09T00:10:00.000Z'),
      metadata: {
        telegramChatId: '1001',
        telegramChatType: 'private',
        telegramIsBotMentioned: true,
        telegramMessageId: '42',
        telegramUsername: 'alice',
        telegramDisplayName: 'Alice'
      }
    })
  })

  it('returns from inbound delivery before downstream processing finishes', async () => {
    const client = new TelegramClientStub()
    const pairingsRepo = new PairingsRepoStub()
    pairingsRepo.setPairing(createApprovedPairing())
    let resolveHandler: (() => void) | undefined
    const onMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve
        })
    )
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo
    })
    channel.onMessage = onMessage

    await channel.start()

    const deliveryPromise = client.deliverText({
      id: '42',
      chatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      text: 'hello from telegram',
      timestamp: new Date('2026-03-09T00:10:00.000Z')
    })

    const result = await Promise.race([
      deliveryPromise.then(() => 'resolved'),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 10))
    ])

    expect(result).toBe('resolved')
    expect(onMessage).toHaveBeenCalled()

    resolveHandler?.()
    await deliveryPromise
  })

  it('does not reject inbound delivery when downstream processing fails', async () => {
    const client = new TelegramClientStub()
    const pairingsRepo = new PairingsRepoStub()
    pairingsRepo.setPairing(createApprovedPairing())
    const onMessage = vi.fn(async () => {
      throw new Error('downstream failed')
    })
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo
    })
    channel.onMessage = onMessage

    await channel.start()

    await expect(
      client.deliverText({
        id: '42',
        chatId: '1001',
        senderId: '1001',
        senderDisplayName: 'Alice',
        senderUsername: 'alice',
        text: 'hello from telegram',
        timestamp: new Date('2026-03-09T00:10:00.000Z')
      })
    ).resolves.toBeUndefined()
    expect(onMessage).toHaveBeenCalled()
  })

  it('sends assistant replies back to the Telegram chat', async () => {
    const client = new TelegramClientStub()
    const channel = new TelegramChannel({
      id: 'channel-telegram',
      botToken: '123456:test-token',
      client,
      pairingsRepo: new PairingsRepoStub()
    })

    await channel.send('1001', 'reply from tia')

    expect(client.sendMessage).toHaveBeenCalledWith('1001', 'reply from tia')
  })
})
