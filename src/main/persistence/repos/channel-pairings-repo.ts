import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type ChannelPairingStatus = 'pending' | 'approved' | 'rejected' | 'revoked'

export type AppChannelPairing = {
  id: string
  channelId: string
  remoteChatId: string
  senderId: string
  senderDisplayName: string
  senderUsername: string | null
  code: string
  status: ChannelPairingStatus
  expiresAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  revokedAt: string | null
  lastSeenAt: string
  createdAt: string
  updatedAt: string
}

export type CreateOrRefreshPendingPairingInput = {
  channelId: string
  remoteChatId: string
  senderId: string
  senderDisplayName: string
  senderUsername?: string | null
  code: string
  expiresAt: string
  lastSeenAt: string
}

function parsePairingRow(row: Record<string, unknown>): AppChannelPairing {
  return {
    id: String(row.id),
    channelId: String(row.channel_id),
    remoteChatId: String(row.remote_chat_id),
    senderId: String(row.sender_id),
    senderDisplayName: String(row.sender_display_name),
    senderUsername: row.sender_username ? String(row.sender_username) : null,
    code: String(row.code),
    status: String(row.status) as ChannelPairingStatus,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    rejectedAt: row.rejected_at ? String(row.rejected_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    lastSeenAt: String(row.last_seen_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

const CHANNEL_PAIRING_SELECT = `
  SELECT
    id,
    channel_id,
    remote_chat_id,
    sender_id,
    sender_display_name,
    sender_username,
    code,
    status,
    expires_at,
    approved_at,
    rejected_at,
    revoked_at,
    last_seen_at,
    created_at,
    updated_at
  FROM app_channel_pairings
`

export class ChannelPairingsRepository {
  constructor(private readonly db: AppDatabase) {}

  async getById(id: string): Promise<AppChannelPairing | null> {
    const result = await this.db.execute(`${CHANNEL_PAIRING_SELECT} WHERE id = ? LIMIT 1`, [id])
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parsePairingRow(row as Record<string, unknown>)
  }

  async getByChannelAndSender(
    channelId: string,
    remoteChatId: string,
    senderId: string
  ): Promise<AppChannelPairing | null> {
    const result = await this.db.execute(
      `${CHANNEL_PAIRING_SELECT} WHERE channel_id = ? AND remote_chat_id = ? AND sender_id = ? LIMIT 1`,
      [channelId, remoteChatId, senderId]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parsePairingRow(row as Record<string, unknown>)
  }

  async listByChannelId(channelId: string): Promise<AppChannelPairing[]> {
    const result = await this.db.execute(
      `
        ${CHANNEL_PAIRING_SELECT}
        WHERE channel_id = ?
        ORDER BY
          CASE status
            WHEN 'pending' THEN 0
            WHEN 'approved' THEN 1
            WHEN 'rejected' THEN 2
            ELSE 3
          END ASC,
          last_seen_at DESC,
          created_at DESC
      `,
      [channelId]
    )

    return result.rows.map((row) => parsePairingRow(row as Record<string, unknown>))
  }

  async countByChannelIdAndStatus(
    channelId: string,
    status: ChannelPairingStatus
  ): Promise<number> {
    const result = await this.db.execute(
      `
        SELECT COUNT(*) AS count
        FROM app_channel_pairings
        WHERE channel_id = ? AND status = ?
      `,
      [channelId, status]
    )

    return Number((result.rows.at(0) as Record<string, unknown> | undefined)?.count ?? 0)
  }

  async countActivePendingByChannelId(channelId: string, now: string): Promise<number> {
    const result = await this.db.execute(
      `
        SELECT COUNT(*) AS count
        FROM app_channel_pairings
        WHERE channel_id = ?
          AND status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at > ?
      `,
      [channelId, now]
    )

    return Number((result.rows.at(0) as Record<string, unknown> | undefined)?.count ?? 0)
  }

  async createOrRefreshPending(
    input: CreateOrRefreshPendingPairingInput
  ): Promise<AppChannelPairing> {
    const existing = await this.getByChannelAndSender(
      input.channelId,
      input.remoteChatId,
      input.senderId
    )

    if (!existing) {
      const id = randomUUID()

      await this.db.execute(
        `
          INSERT INTO app_channel_pairings (
            id,
            channel_id,
            remote_chat_id,
            sender_id,
            sender_display_name,
            sender_username,
            code,
            status,
            expires_at,
            approved_at,
            rejected_at,
            revoked_at,
            last_seen_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, NULL, ?)
        `,
        [
          id,
          input.channelId,
          input.remoteChatId,
          input.senderId,
          input.senderDisplayName,
          input.senderUsername ?? null,
          input.code,
          input.expiresAt,
          input.lastSeenAt
        ]
      )

      const created = await this.getById(id)
      if (!created) {
        throw new Error('Failed to create channel pairing')
      }

      return created
    }

    await this.db.execute(
      `
        UPDATE app_channel_pairings
        SET
          sender_display_name = ?,
          sender_username = ?,
          code = ?,
          status = 'pending',
          expires_at = ?,
          approved_at = NULL,
          rejected_at = NULL,
          revoked_at = NULL,
          last_seen_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        input.senderDisplayName,
        input.senderUsername ?? null,
        input.code,
        input.expiresAt,
        input.lastSeenAt,
        existing.id
      ]
    )

    const refreshed = await this.getById(existing.id)
    if (!refreshed) {
      throw new Error('Failed to refresh channel pairing')
    }

    return refreshed
  }

  async approve(id: string, approvedAt: string): Promise<AppChannelPairing | null> {
    await this.db.execute(
      `
        UPDATE app_channel_pairings
        SET
          status = 'approved',
          expires_at = NULL,
          approved_at = ?,
          rejected_at = NULL,
          revoked_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [approvedAt, id]
    )

    return this.getById(id)
  }

  async reject(id: string, rejectedAt: string): Promise<AppChannelPairing | null> {
    await this.db.execute(
      `
        UPDATE app_channel_pairings
        SET
          status = 'rejected',
          expires_at = NULL,
          rejected_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [rejectedAt, id]
    )

    return this.getById(id)
  }

  async revoke(id: string, revokedAt: string): Promise<AppChannelPairing | null> {
    await this.db.execute(
      `
        UPDATE app_channel_pairings
        SET
          status = 'revoked',
          expires_at = NULL,
          revoked_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [revokedAt, id]
    )

    return this.getById(id)
  }
}
