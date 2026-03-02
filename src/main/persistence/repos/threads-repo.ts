import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type AppThread = {
  id: string
  assistantId: string
  resourceId: string
  title: string
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateThreadInput = {
  assistantId: string
  resourceId: string
  title: string
}

function parseThreadRow(row: Record<string, unknown>): AppThread {
  return {
    id: String(row.id),
    assistantId: String(row.assistant_id),
    resourceId: String(row.resource_id),
    title: String(row.title),
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class ThreadsRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByAssistant(assistantId: string): Promise<AppThread[]> {
    const result = await this.db.execute(
      'SELECT id, assistant_id, resource_id, title, last_message_at, created_at, updated_at FROM app_threads WHERE assistant_id = ? ORDER BY COALESCE(last_message_at, created_at) DESC',
      [assistantId]
    )

    return result.rows.map((row) => parseThreadRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppThread | null> {
    const result = await this.db.execute(
      'SELECT id, assistant_id, resource_id, title, last_message_at, created_at, updated_at FROM app_threads WHERE id = ? LIMIT 1',
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseThreadRow(row as Record<string, unknown>)
  }

  async create(input: CreateThreadInput): Promise<AppThread> {
    const id = randomUUID()
    await this.db.execute(
      'INSERT INTO app_threads (id, assistant_id, resource_id, title) VALUES (?, ?, ?, ?)',
      [id, input.assistantId, input.resourceId, input.title]
    )

    const thread = await this.getById(id)
    if (!thread) {
      throw new Error('Failed to create thread')
    }

    return thread
  }

  async updateTitle(id: string, title: string): Promise<AppThread | null> {
    await this.db.execute(
      'UPDATE app_threads SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, id]
    )

    return this.getById(id)
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id)
    if (!existing) {
      return false
    }

    await this.db.execute('DELETE FROM app_threads WHERE id = ?', [id])
    return true
  }

  async touchLastMessageAt(id: string, timestamp: string): Promise<void> {
    await this.db.execute(
      'UPDATE app_threads SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [timestamp, id]
    )
  }
}
