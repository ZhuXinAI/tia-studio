import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type AppTeamThread = {
  id: string
  workspaceId: string
  resourceId: string
  title: string
  teamDescription: string
  supervisorProviderId: string | null
  supervisorModel: string
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export type AppTeamThreadMember = {
  teamThreadId: string
  assistantId: string
  sortOrder: number
  createdAt: string
}

export type CreateTeamThreadInput = {
  workspaceId: string
  resourceId: string
  title: string
}

export type UpdateTeamThreadInput = {
  title?: string
  teamDescription?: string
  supervisorProviderId?: string | null
  supervisorModel?: string
}

function parseTeamThreadRow(row: Record<string, unknown>): AppTeamThread {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    resourceId: String(row.resource_id),
    title: String(row.title),
    teamDescription: String(row.team_description),
    supervisorProviderId: row.supervisor_provider_id ? String(row.supervisor_provider_id) : null,
    supervisorModel: String(row.supervisor_model),
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function parseTeamThreadMemberRow(row: Record<string, unknown>): AppTeamThreadMember {
  return {
    teamThreadId: String(row.team_thread_id),
    assistantId: String(row.assistant_id),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at)
  }
}

export class TeamThreadsRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByWorkspace(workspaceId: string): Promise<AppTeamThread[]> {
    const result = await this.db.execute(
      'SELECT id, workspace_id, resource_id, title, team_description, supervisor_provider_id, supervisor_model, last_message_at, created_at, updated_at FROM app_team_threads WHERE workspace_id = ? ORDER BY COALESCE(last_message_at, created_at) DESC',
      [workspaceId]
    )

    return result.rows.map((row) => parseTeamThreadRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppTeamThread | null> {
    const result = await this.db.execute(
      'SELECT id, workspace_id, resource_id, title, team_description, supervisor_provider_id, supervisor_model, last_message_at, created_at, updated_at FROM app_team_threads WHERE id = ? LIMIT 1',
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseTeamThreadRow(row as Record<string, unknown>)
  }

  async create(input: CreateTeamThreadInput): Promise<AppTeamThread> {
    const id = randomUUID()
    await this.db.execute(
      'INSERT INTO app_team_threads (id, workspace_id, resource_id, title) VALUES (?, ?, ?, ?)',
      [id, input.workspaceId, input.resourceId, input.title]
    )

    const thread = await this.getById(id)
    if (!thread) {
      throw new Error('Failed to create team thread')
    }

    return thread
  }

  async update(id: string, input: UpdateTeamThreadInput): Promise<AppTeamThread | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    const supervisorProviderId =
      'supervisorProviderId' in input
        ? (input.supervisorProviderId ?? null)
        : existing.supervisorProviderId

    await this.db.execute(
      'UPDATE app_team_threads SET title = ?, team_description = ?, supervisor_provider_id = ?, supervisor_model = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        input.title ?? existing.title,
        input.teamDescription ?? existing.teamDescription,
        supervisorProviderId,
        input.supervisorModel ?? existing.supervisorModel,
        id
      ]
    )

    return this.getById(id)
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id)
    if (!existing) {
      return false
    }

    await this.db.execute('DELETE FROM app_team_threads WHERE id = ?', [id])
    return true
  }

  async listMembers(threadId: string): Promise<AppTeamThreadMember[]> {
    const result = await this.db.execute(
      'SELECT team_thread_id, assistant_id, sort_order, created_at FROM app_team_thread_members WHERE team_thread_id = ? ORDER BY sort_order ASC, created_at ASC',
      [threadId]
    )

    return result.rows.map((row) => parseTeamThreadMemberRow(row as Record<string, unknown>))
  }

  async replaceMembers(threadId: string, assistantIds: string[]): Promise<void> {
    const uniqueAssistantIds = assistantIds.filter(
      (assistantId, index) => assistantIds.indexOf(assistantId) === index
    )

    await this.db.execute('DELETE FROM app_team_thread_members WHERE team_thread_id = ?', [
      threadId
    ])

    for (const [index, assistantId] of uniqueAssistantIds.entries()) {
      await this.db.execute(
        'INSERT INTO app_team_thread_members (team_thread_id, assistant_id, sort_order) VALUES (?, ?, ?)',
        [threadId, assistantId, index]
      )
    }
  }

  async touchLastMessageAt(id: string, timestamp: string): Promise<AppTeamThread | null> {
    await this.db.execute(
      'UPDATE app_team_threads SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [timestamp, id]
    )

    return this.getById(id)
  }

  async updateTitle(id: string, title: string): Promise<AppTeamThread | null> {
    await this.db.execute(
      'UPDATE app_team_threads SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, id]
    )

    return this.getById(id)
  }
}
