import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type AppGroupThread = {
  id: string
  workspaceId: string
  resourceId: string
  title: string
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export type AppGroupThreadMessage = {
  id: string
  threadId: string
  role: 'user' | 'assistant' | 'system'
  authorType: 'watcher' | 'assistant' | 'orchestrator'
  authorId: string | null
  authorName: string
  content: string
  mentions: string[]
  replyToMessageId: string | null
  createdAt: string
}

export type AppGroupThreadAssistantThreadBinding = {
  groupThreadId: string
  assistantId: string
  assistantThreadId: string
  createdAt: string
}

export type CreateGroupThreadInput = {
  workspaceId: string
  resourceId: string
  title: string
}

export type UpdateGroupThreadInput = {
  title?: string
}

export type AppendGroupThreadMessageInput = {
  threadId: string
  role: AppGroupThreadMessage['role']
  authorType: AppGroupThreadMessage['authorType']
  authorId?: string | null
  authorName: string
  content: string
  mentions?: string[]
  replyToMessageId?: string | null
  createdAt?: string
}

export type UpsertGroupAssistantThreadBindingInput = {
  groupThreadId: string
  assistantId: string
  assistantThreadId: string
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

function parseGroupThreadRow(row: Record<string, unknown>): AppGroupThread {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    resourceId: String(row.resource_id),
    title: String(row.title),
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function parseGroupThreadMessageRow(row: Record<string, unknown>): AppGroupThreadMessage {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    role: String(row.role) as AppGroupThreadMessage['role'],
    authorType: String(row.author_type) as AppGroupThreadMessage['authorType'],
    authorId: row.author_id ? String(row.author_id) : null,
    authorName: String(row.author_name),
    content: String(row.content),
    mentions: parseStringArray(row.mentions_json),
    replyToMessageId: row.reply_to_message_id ? String(row.reply_to_message_id) : null,
    createdAt: String(row.created_at)
  }
}

function parseAssistantThreadBindingRow(
  row: Record<string, unknown>
): AppGroupThreadAssistantThreadBinding {
  return {
    groupThreadId: String(row.group_thread_id),
    assistantId: String(row.assistant_id),
    assistantThreadId: String(row.assistant_thread_id),
    createdAt: String(row.created_at)
  }
}

export class GroupThreadsRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByWorkspace(workspaceId: string): Promise<AppGroupThread[]> {
    const result = await this.db.execute(
      'SELECT id, workspace_id, resource_id, title, last_message_at, created_at, updated_at FROM app_group_threads WHERE workspace_id = ? ORDER BY COALESCE(last_message_at, created_at) DESC, rowid DESC',
      [workspaceId]
    )

    return result.rows.map((row) => parseGroupThreadRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppGroupThread | null> {
    const result = await this.db.execute(
      'SELECT id, workspace_id, resource_id, title, last_message_at, created_at, updated_at FROM app_group_threads WHERE id = ? LIMIT 1',
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseGroupThreadRow(row as Record<string, unknown>)
  }

  async create(input: CreateGroupThreadInput): Promise<AppGroupThread> {
    const id = randomUUID()
    await this.db.execute(
      'INSERT INTO app_group_threads (id, workspace_id, resource_id, title) VALUES (?, ?, ?, ?)',
      [id, input.workspaceId, input.resourceId, input.title]
    )

    const thread = await this.getById(id)
    if (!thread) {
      throw new Error('Failed to create group thread')
    }

    return thread
  }

  async update(id: string, input: UpdateGroupThreadInput): Promise<AppGroupThread | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    await this.db.execute(
      'UPDATE app_group_threads SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [input.title ?? existing.title, id]
    )

    return this.getById(id)
  }

  async updateTitle(id: string, title: string): Promise<AppGroupThread | null> {
    return this.update(id, { title })
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id)
    if (!existing) {
      return false
    }

    await this.db.execute('DELETE FROM app_group_threads WHERE id = ?', [id])
    return true
  }

  async touchLastMessageAt(id: string, timestamp: string): Promise<AppGroupThread | null> {
    await this.db.execute(
      'UPDATE app_group_threads SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [timestamp, id]
    )

    return this.getById(id)
  }

  async appendMessage(input: AppendGroupThreadMessageInput): Promise<AppGroupThreadMessage> {
    const id = randomUUID()
    const createdAt = input.createdAt ?? new Date().toISOString()
    await this.db.execute(
      `
        INSERT INTO app_group_thread_messages (
          id,
          thread_id,
          role,
          author_type,
          author_id,
          author_name,
          content,
          mentions_json,
          reply_to_message_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.threadId,
        input.role,
        input.authorType,
        input.authorId ?? null,
        input.authorName,
        input.content,
        JSON.stringify(input.mentions ?? []),
        input.replyToMessageId ?? null,
        createdAt
      ]
    )

    await this.touchLastMessageAt(input.threadId, createdAt)

    const message = await this.getMessageById(id)
    if (!message) {
      throw new Error('Failed to create group thread message')
    }

    return message
  }

  async listMessages(threadId: string): Promise<AppGroupThreadMessage[]> {
    const result = await this.db.execute(
      `
        SELECT
          id,
          thread_id,
          role,
          author_type,
          author_id,
          author_name,
          content,
          mentions_json,
          reply_to_message_id,
          created_at
        FROM app_group_thread_messages
        WHERE thread_id = ?
        ORDER BY created_at ASC, rowid ASC
      `,
      [threadId]
    )

    return result.rows.map((row) => parseGroupThreadMessageRow(row as Record<string, unknown>))
  }

  async getAssistantThreadBinding(
    groupThreadId: string,
    assistantId: string
  ): Promise<AppGroupThreadAssistantThreadBinding | null> {
    const result = await this.db.execute(
      `
        SELECT group_thread_id, assistant_id, assistant_thread_id, created_at
        FROM app_group_thread_assistant_threads
        WHERE group_thread_id = ? AND assistant_id = ?
        LIMIT 1
      `,
      [groupThreadId, assistantId]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseAssistantThreadBindingRow(row as Record<string, unknown>)
  }

  async listAssistantThreadBindings(
    groupThreadId: string
  ): Promise<AppGroupThreadAssistantThreadBinding[]> {
    const result = await this.db.execute(
      `
        SELECT group_thread_id, assistant_id, assistant_thread_id, created_at
        FROM app_group_thread_assistant_threads
        WHERE group_thread_id = ?
        ORDER BY created_at ASC
      `,
      [groupThreadId]
    )

    return result.rows.map((row) =>
      parseAssistantThreadBindingRow(row as Record<string, unknown>)
    )
  }

  async upsertAssistantThreadBinding(
    input: UpsertGroupAssistantThreadBindingInput
  ): Promise<AppGroupThreadAssistantThreadBinding> {
    await this.db.execute(
      `
        INSERT INTO app_group_thread_assistant_threads (
          group_thread_id,
          assistant_id,
          assistant_thread_id
        ) VALUES (?, ?, ?)
        ON CONFLICT(group_thread_id, assistant_id)
        DO UPDATE SET assistant_thread_id = excluded.assistant_thread_id
      `,
      [input.groupThreadId, input.assistantId, input.assistantThreadId]
    )

    const binding = await this.getAssistantThreadBinding(input.groupThreadId, input.assistantId)
    if (!binding) {
      throw new Error('Failed to upsert group assistant thread binding')
    }

    return binding
  }

  private async getMessageById(id: string): Promise<AppGroupThreadMessage | null> {
    const result = await this.db.execute(
      `
        SELECT
          id,
          thread_id,
          role,
          author_type,
          author_id,
          author_name,
          content,
          mentions_json,
          reply_to_message_id,
          created_at
        FROM app_group_thread_messages
        WHERE id = ?
        LIMIT 1
      `,
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseGroupThreadMessageRow(row as Record<string, unknown>)
  }
}
