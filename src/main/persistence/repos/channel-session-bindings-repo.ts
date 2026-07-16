import type { AppDatabase } from '../client'

export type AppChannelSessionBinding = {
  channelId: string
  remoteChatId: string
  sessionId: string
  createdAt: string
}

const SELECT =
  'SELECT channel_id, remote_chat_id, session_id, created_at FROM app_channel_session_bindings'

function parse(row: Record<string, unknown>): AppChannelSessionBinding {
  return {
    channelId: String(row.channel_id),
    remoteChatId: String(row.remote_chat_id),
    sessionId: String(row.session_id),
    createdAt: String(row.created_at)
  }
}

export class ChannelSessionBindingsRepository {
  constructor(private readonly db: AppDatabase) {}
  async getByChannelAndRemoteChat(
    channelId: string,
    remoteChatId: string
  ): Promise<AppChannelSessionBinding | null> {
    const result = await this.db.execute(
      `${SELECT} WHERE channel_id = ? AND remote_chat_id = ? LIMIT 1`,
      [channelId, remoteChatId]
    )
    const row = result.rows.at(0)
    return row ? parse(row as Record<string, unknown>) : null
  }
  async upsert(input: {
    channelId: string
    remoteChatId: string
    sessionId: string
  }): Promise<AppChannelSessionBinding> {
    await this.db.execute(
      `INSERT INTO app_channel_session_bindings (channel_id, remote_chat_id, session_id)
       VALUES (?, ?, ?)
       ON CONFLICT(channel_id, remote_chat_id)
       DO UPDATE SET session_id = excluded.session_id, created_at = CURRENT_TIMESTAMP`,
      [input.channelId, input.remoteChatId, input.sessionId]
    )
    const binding = await this.getByChannelAndRemoteChat(input.channelId, input.remoteChatId)
    if (!binding) throw new Error('Failed to bind channel session')
    return binding
  }
  async delete(channelId: string, remoteChatId: string): Promise<void> {
    await this.db.execute(
      'DELETE FROM app_channel_session_bindings WHERE channel_id = ? AND remote_chat_id = ?',
      [channelId, remoteChatId]
    )
  }
}
