import type { AppDatabase } from '../client'

export type AppChannelThreadBinding = {
  channelId: string
  remoteChatId: string
  threadId: string
  createdAt: string
}

export type CreateChannelThreadBindingInput = {
  channelId: string
  remoteChatId: string
  threadId: string
}

export type UpsertChannelThreadBindingInput = CreateChannelThreadBindingInput

function parseChannelThreadBindingRow(row: Record<string, unknown>): AppChannelThreadBinding {
  return {
    channelId: String(row.channel_id),
    remoteChatId: String(row.remote_chat_id),
    threadId: String(row.thread_id),
    createdAt: String(row.created_at)
  }
}

const CHANNEL_THREAD_BINDING_SELECT = `
  SELECT channel_id, remote_chat_id, thread_id, created_at
  FROM app_channel_thread_bindings
`

export class ChannelThreadBindingsRepository {
  constructor(private readonly db: AppDatabase) {}

  async getByChannelAndRemoteChat(
    channelId: string,
    remoteChatId: string
  ): Promise<AppChannelThreadBinding | null> {
    const result = await this.db.execute(
      `${CHANNEL_THREAD_BINDING_SELECT} WHERE channel_id = ? AND remote_chat_id = ? LIMIT 1`,
      [channelId, remoteChatId]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseChannelThreadBindingRow(row as Record<string, unknown>)
  }

  async create(input: CreateChannelThreadBindingInput): Promise<AppChannelThreadBinding> {
    await this.db.execute(
      `
        INSERT OR IGNORE INTO app_channel_thread_bindings (channel_id, remote_chat_id, thread_id)
        VALUES (?, ?, ?)
      `,
      [input.channelId, input.remoteChatId, input.threadId]
    )

    const binding = await this.getByChannelAndRemoteChat(input.channelId, input.remoteChatId)
    if (!binding) {
      throw new Error('Failed to create channel thread binding')
    }

    return binding
  }

  async upsert(input: UpsertChannelThreadBindingInput): Promise<AppChannelThreadBinding> {
    await this.db.execute(
      `
        INSERT INTO app_channel_thread_bindings (channel_id, remote_chat_id, thread_id)
        VALUES (?, ?, ?)
        ON CONFLICT(channel_id, remote_chat_id)
        DO UPDATE SET
          thread_id = excluded.thread_id,
          created_at = CURRENT_TIMESTAMP
      `,
      [input.channelId, input.remoteChatId, input.threadId]
    )

    const binding = await this.getByChannelAndRemoteChat(input.channelId, input.remoteChatId)
    if (!binding) {
      throw new Error('Failed to upsert channel thread binding')
    }

    return binding
  }

  async listByThreadIds(threadIds: string[]): Promise<AppChannelThreadBinding[]> {
    if (threadIds.length === 0) {
      return []
    }

    const placeholders = threadIds.map(() => '?').join(', ')
    const result = await this.db.execute(
      `${CHANNEL_THREAD_BINDING_SELECT} WHERE thread_id IN (${placeholders}) ORDER BY created_at DESC`,
      threadIds
    )

    return result.rows.map((row) => parseChannelThreadBindingRow(row as Record<string, unknown>))
  }
}
