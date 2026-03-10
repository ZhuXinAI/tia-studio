import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  AppChannelPairing,
  ChannelPairingStatus
} from '../persistence/repos/channel-pairings-repo'
import { WhatsAppAuthStateStore } from './whatsapp-auth-state-store'
import { WhatsAppChannel } from './whatsapp-channel'

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
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z',
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

type ConnectionUpdate =
  | { status: 'connecting' }
  | { status: 'qr_ready'; qrCodeValue: string; qrCodeDataUrl: string }
  | { status: 'connected'; phoneNumber: string | null }
  | { status: 'disconnected'; errorMessage: string | null; disconnectReason: number | null }
  | { status: 'error'; errorMessage: string }

type InboundTextMessage = {
  id: string
  chatId: string
  senderId: string
  senderUsername: string | null
  senderDisplayName: string
  text: string
  timestamp: Date
}

class WhatsAppClientStub {
  readonly connect = vi.fn(async () => undefined)
  readonly disconnect = vi.fn(async (reason?: string) => {
    void reason
    return undefined
  })
  readonly sendMessage = vi.fn(async (chatId: string, text: string) => {
    void chatId
    void text
    return undefined
  })
  readonly resetAuthState = vi.fn(async () => undefined)

  private connectionHandler: ((update: ConnectionUpdate) => Promise<void> | void) | null = null
  private textHandler: ((message: InboundTextMessage) => Promise<void>) | null = null

  onConnectionUpdate(handler: (update: ConnectionUpdate) => Promise<void> | void): void {
    this.connectionHandler = handler
  }

  onText(handler: (message: InboundTextMessage) => Promise<void>): void {
    this.textHandler = handler
  }

  async emitConnection(update: ConnectionUpdate): Promise<void> {
    await this.connectionHandler?.(update)
  }

  async deliverText(input: {
    id?: string
    chatId: string
    senderId: string
    senderDisplayName: string
    text: string
    timestamp?: Date
  }): Promise<void> {
    await this.textHandler?.({
      id: input.id ?? 'wam-msg-1',
      chatId: input.chatId,
      senderId: input.senderId,
      senderUsername: null,
      senderDisplayName: input.senderDisplayName,
      text: input.text,
      timestamp: input.timestamp ?? new Date('2026-03-10T00:00:00.000Z')
    })
  }
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
    channelId: 'channel-whatsapp',
    remoteChatId: '8613800138000@s.whatsapp.net',
    senderId: '8613800138000@s.whatsapp.net',
    senderDisplayName: 'Alice',
    senderUsername: null,
    code: 'AB7KQ2XM',
    status,
    expiresAt: null,
    approvedAt: status === 'approved' ? '2026-03-10T00:05:00.000Z' : null,
    rejectedAt: status === 'rejected' ? '2026-03-10T00:05:00.000Z' : null,
    revokedAt: status === 'revoked' ? '2026-03-10T00:05:00.000Z' : null,
    lastSeenAt: '2026-03-10T00:00:00.000Z'
  }
}

describe('WhatsAppChannel', () => {
  it('starts the injected client and stores qr login state', async () => {
    const client = new WhatsAppClientStub()
    const authStateStore = new WhatsAppAuthStateStore({
      now: () => new Date('2026-03-10T00:00:00.000Z')
    })
    const channel = new WhatsAppChannel({
      id: 'channel-whatsapp',
      authDirectoryPath: '/tmp/channel-whatsapp',
      clientFactory: async () => client,
      authStateStore,
      pairingsRepo: new PairingsRepoStub()
    })

    await channel.start()
    await Promise.resolve()
    await client.emitConnection({
      status: 'qr_ready',
      qrCodeValue: 'whatsapp-qr-value',
      qrCodeDataUrl: 'data:image/png;base64,qr'
    })

    expect(client.connect).toHaveBeenCalledOnce()
    expect(authStateStore.get('channel-whatsapp')).toMatchObject({
      status: 'qr_ready',
      qrCodeValue: 'whatsapp-qr-value',
      qrCodeDataUrl: 'data:image/png;base64,qr'
    })
  })

  it('creates a pending pairing for an unknown dm and replies with its code', async () => {
    const client = new WhatsAppClientStub()
    const pairingsRepo = new PairingsRepoStub()
    const onMessage = vi.fn()
    const channel = new WhatsAppChannel({
      id: 'channel-whatsapp',
      authDirectoryPath: '/tmp/channel-whatsapp',
      clientFactory: async () => client,
      authStateStore: new WhatsAppAuthStateStore(),
      pairingsRepo,
      generateCode: () => 'AB7KQ2XM',
      now: () => new Date('2026-03-10T00:00:00.000Z')
    })
    channel.onMessage = onMessage

    await channel.start()
    await Promise.resolve()
    await client.deliverText({
      chatId: '8613800138000@s.whatsapp.net',
      senderId: '8613800138000@s.whatsapp.net',
      senderDisplayName: 'Alice',
      text: 'hello from whatsapp'
    })

    expect(onMessage).not.toHaveBeenCalled()
    expect(pairingsRepo.list()).toHaveLength(1)
    expect(pairingsRepo.list()[0]).toMatchObject({
      status: 'pending',
      code: 'AB7KQ2XM'
    })
    expect(client.sendMessage).toHaveBeenCalledWith(
      '8613800138000@s.whatsapp.net',
      expect.stringContaining('AB7KQ2XM')
    )
  })

  it('reuses an existing unexpired pending pairing without creating another one', async () => {
    const client = new WhatsAppClientStub()
    const pairingsRepo = new PairingsRepoStub()
    pairingsRepo.setPairing({
      channelId: 'channel-whatsapp',
      remoteChatId: '8613800138000@s.whatsapp.net',
      senderId: '8613800138000@s.whatsapp.net',
      senderDisplayName: 'Alice',
      senderUsername: null,
      code: 'AB7KQ2XM',
      status: 'pending',
      expiresAt: '2026-03-10T01:00:00.000Z',
      approvedAt: null,
      rejectedAt: null,
      revokedAt: null,
      lastSeenAt: '2026-03-10T00:00:00.000Z'
    })
    const channel = new WhatsAppChannel({
      id: 'channel-whatsapp',
      authDirectoryPath: '/tmp/channel-whatsapp',
      clientFactory: async () => client,
      authStateStore: new WhatsAppAuthStateStore(),
      pairingsRepo,
      generateCode: () => 'ZZ9YY8XX',
      now: () => new Date('2026-03-10T00:15:00.000Z')
    })

    await channel.start()
    await Promise.resolve()
    await client.deliverText({
      chatId: '8613800138000@s.whatsapp.net',
      senderId: '8613800138000@s.whatsapp.net',
      senderDisplayName: 'Alice',
      text: 'still waiting'
    })

    expect(pairingsRepo.list()).toHaveLength(1)
    expect(pairingsRepo.list()[0]?.code).toBe('AB7KQ2XM')
    expect(client.sendMessage).toHaveBeenCalledWith(
      '8613800138000@s.whatsapp.net',
      expect.stringContaining('AB7KQ2XM')
    )
  })

  it('blocks rejected and revoked users from reaching the assistant', async () => {
    const client = new WhatsAppClientStub()
    const pairingsRepo = new PairingsRepoStub()
    pairingsRepo.setPairing(createApprovedPairing('rejected'))
    const onMessage = vi.fn()
    const channel = new WhatsAppChannel({
      id: 'channel-whatsapp',
      authDirectoryPath: '/tmp/channel-whatsapp',
      clientFactory: async () => client,
      authStateStore: new WhatsAppAuthStateStore(),
      pairingsRepo
    })
    channel.onMessage = onMessage

    await channel.start()
    await Promise.resolve()
    await client.deliverText({
      chatId: '8613800138000@s.whatsapp.net',
      senderId: '8613800138000@s.whatsapp.net',
      senderDisplayName: 'Alice',
      text: 'hello again'
    })

    expect(onMessage).not.toHaveBeenCalled()
    expect(client.sendMessage).toHaveBeenCalledWith(
      '8613800138000@s.whatsapp.net',
      expect.stringContaining('not approved')
    )
  })

  it('forwards approved private text messages to the shared channel contract', async () => {
    const client = new WhatsAppClientStub()
    const pairingsRepo = new PairingsRepoStub()
    pairingsRepo.setPairing(createApprovedPairing())
    const onMessage = vi.fn()
    const channel = new WhatsAppChannel({
      id: 'channel-whatsapp',
      authDirectoryPath: '/tmp/channel-whatsapp',
      clientFactory: async () => client,
      authStateStore: new WhatsAppAuthStateStore(),
      pairingsRepo
    })
    channel.onMessage = onMessage

    await channel.start()
    await Promise.resolve()
    await client.deliverText({
      id: 'wam-msg-42',
      chatId: '8613800138000@s.whatsapp.net',
      senderId: '8613800138000@s.whatsapp.net',
      senderDisplayName: 'Alice',
      text: 'hello from whatsapp',
      timestamp: new Date('2026-03-10T00:10:00.000Z')
    })

    expect(onMessage).toHaveBeenCalledWith({
      id: 'wam-msg-42',
      remoteChatId: '8613800138000@s.whatsapp.net',
      senderId: '8613800138000@s.whatsapp.net',
      content: 'hello from whatsapp',
      timestamp: new Date('2026-03-10T00:10:00.000Z'),
      metadata: {
        whatsappChatId: '8613800138000@s.whatsapp.net',
        whatsappMessageId: 'wam-msg-42',
        whatsappPhoneNumber: '8613800138000',
        whatsappDisplayName: 'Alice'
      }
    })
  })

  it('sends assistant replies back to the WhatsApp chat', async () => {
    const client = new WhatsAppClientStub()
    const channel = new WhatsAppChannel({
      id: 'channel-whatsapp',
      authDirectoryPath: '/tmp/channel-whatsapp',
      clientFactory: async () => client,
      authStateStore: new WhatsAppAuthStateStore(),
      pairingsRepo: new PairingsRepoStub()
    })

    await channel.start()
    await Promise.resolve()
    await channel.send('8613800138000@s.whatsapp.net', 'assistant reply')

    expect(client.sendMessage).toHaveBeenCalledWith(
      '8613800138000@s.whatsapp.net',
      'assistant reply'
    )
  })

  it('resets auth state and reconnects after a logged out disconnect', async () => {
    vi.useFakeTimers()

    try {
      const firstClient = new WhatsAppClientStub()
      const secondClient = new WhatsAppClientStub()
      const clientFactory = vi
        .fn<(authDirectoryPath: string) => Promise<WhatsAppClientStub>>()
        .mockResolvedValueOnce(firstClient)
        .mockResolvedValueOnce(secondClient)

      const channel = new WhatsAppChannel({
        id: 'channel-whatsapp',
        authDirectoryPath: '/tmp/channel-whatsapp',
        clientFactory,
        authStateStore: new WhatsAppAuthStateStore(),
        pairingsRepo: new PairingsRepoStub(),
        reconnectDelayMs: 25
      })

      await channel.start()
      await Promise.resolve()
      await firstClient.emitConnection({
        status: 'disconnected',
        errorMessage: 'Logged out',
        disconnectReason: 401
      })

      await vi.advanceTimersByTimeAsync(25)

      expect(firstClient.resetAuthState).toHaveBeenCalledOnce()
      expect(clientFactory).toHaveBeenCalledTimes(2)
      expect(secondClient.connect).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
