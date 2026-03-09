import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { ChannelPairingsRepository } from './channel-pairings-repo'
import { ChannelsRepository } from './channels-repo'
import { ProvidersRepository } from './providers-repo'

describe('ChannelPairingsRepository', () => {
  let db: AppDatabase
  let repo: ChannelPairingsRepository
  let channelId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new ChannelPairingsRepository(db)

    const providersRepo = new ProvidersRepository(db)
    const assistantsRepo = new AssistantsRepository(db)
    const channelsRepo = new ChannelsRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistant = await assistantsRepo.create({
      name: 'Support Assistant',
      providerId: provider.id
    })
    const channel = await channelsRepo.create({
      type: 'telegram',
      name: 'Telegram Bot',
      assistantId: assistant.id,
      enabled: true,
      config: {
        botToken: '123456:test-token'
      }
    })

    channelId = channel.id
  })

  afterEach(() => {
    db.close()
  })

  it('returns null when no pairing exists for a sender', async () => {
    await expect(repo.getByChannelAndSender(channelId, '1001', '1001')).resolves.toBeNull()
  })

  it('creates and refreshes a pending pairing for the same sender', async () => {
    const first = await repo.createOrRefreshPending({
      channelId,
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      expiresAt: '2026-03-09T01:00:00.000Z',
      lastSeenAt: '2026-03-09T00:00:00.000Z'
    })

    expect(first).toMatchObject({
      channelId,
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      status: 'pending',
      expiresAt: '2026-03-09T01:00:00.000Z'
    })

    const refreshed = await repo.createOrRefreshPending({
      channelId,
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice Updated',
      senderUsername: 'alice-updated',
      code: 'CD8LM9NP',
      expiresAt: '2026-03-09T02:00:00.000Z',
      lastSeenAt: '2026-03-09T00:30:00.000Z'
    })

    expect(refreshed.id).toBe(first.id)
    expect(refreshed).toMatchObject({
      senderDisplayName: 'Alice Updated',
      senderUsername: 'alice-updated',
      code: 'CD8LM9NP',
      status: 'pending',
      expiresAt: '2026-03-09T02:00:00.000Z',
      lastSeenAt: '2026-03-09T00:30:00.000Z'
    })
    await expect(repo.listByChannelId(channelId)).resolves.toHaveLength(1)
  })

  it('approves, rejects, and revokes pairings', async () => {
    const pending = await repo.createOrRefreshPending({
      channelId,
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Alice',
      senderUsername: 'alice',
      code: 'AB7KQ2XM',
      expiresAt: '2026-03-09T01:00:00.000Z',
      lastSeenAt: '2026-03-09T00:00:00.000Z'
    })
    const rejected = await repo.createOrRefreshPending({
      channelId,
      remoteChatId: '1002',
      senderId: '1002',
      senderDisplayName: 'Bob',
      senderUsername: 'bob',
      code: 'ZX7YQ2PM',
      expiresAt: '2026-03-09T01:00:00.000Z',
      lastSeenAt: '2026-03-09T00:10:00.000Z'
    })

    const approved = await repo.approve(pending.id, '2026-03-09T00:15:00.000Z')
    const rejectedState = await repo.reject(rejected.id, '2026-03-09T00:20:00.000Z')
    const revoked = await repo.revoke(pending.id, '2026-03-09T00:30:00.000Z')

    expect(approved).toMatchObject({
      id: pending.id,
      status: 'approved',
      approvedAt: '2026-03-09T00:15:00.000Z',
      expiresAt: null
    })
    expect(rejectedState).toMatchObject({
      id: rejected.id,
      status: 'rejected',
      rejectedAt: '2026-03-09T00:20:00.000Z',
      expiresAt: null
    })
    expect(revoked).toMatchObject({
      id: pending.id,
      status: 'revoked',
      revokedAt: '2026-03-09T00:30:00.000Z'
    })
  })

  it('counts active pending pairings and lists pending requests first', async () => {
    const approved = await repo.createOrRefreshPending({
      channelId,
      remoteChatId: '1001',
      senderId: '1001',
      senderDisplayName: 'Approved User',
      senderUsername: 'approved',
      code: 'AB7KQ2XM',
      expiresAt: '2026-03-09T01:00:00.000Z',
      lastSeenAt: '2026-03-09T00:00:00.000Z'
    })
    await repo.approve(approved.id, '2026-03-09T00:05:00.000Z')

    await repo.createOrRefreshPending({
      channelId,
      remoteChatId: '1002',
      senderId: '1002',
      senderDisplayName: 'Expired Pending',
      senderUsername: 'expired',
      code: 'ZX7YQ2PM',
      expiresAt: '2026-03-09T00:10:00.000Z',
      lastSeenAt: '2026-03-09T00:00:00.000Z'
    })
    await repo.createOrRefreshPending({
      channelId,
      remoteChatId: '1003',
      senderId: '1003',
      senderDisplayName: 'Fresh Pending',
      senderUsername: 'fresh',
      code: 'MN6PQ8RT',
      expiresAt: '2026-03-09T02:00:00.000Z',
      lastSeenAt: '2026-03-09T00:30:00.000Z'
    })
    await repo.createOrRefreshPending({
      channelId,
      remoteChatId: '1004',
      senderId: '1004',
      senderDisplayName: 'Newest Pending',
      senderUsername: 'newest',
      code: 'UV2WX3YZ',
      expiresAt: '2026-03-09T03:00:00.000Z',
      lastSeenAt: '2026-03-09T00:45:00.000Z'
    })

    await expect(
      repo.countActivePendingByChannelId(channelId, '2026-03-09T00:20:00.000Z')
    ).resolves.toBe(2)
    await expect(repo.countByChannelIdAndStatus(channelId, 'approved')).resolves.toBe(1)

    const listed = await repo.listByChannelId(channelId)

    expect(listed.map((pairing) => [pairing.senderId, pairing.status])).toEqual([
      ['1004', 'pending'],
      ['1003', 'pending'],
      ['1002', 'pending'],
      ['1001', 'approved']
    ])
  })
})
