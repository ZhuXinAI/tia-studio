import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type AppGroupWorkspace = {
  id: string
  name: string
  rootPath: string
  groupDescription: string
  maxAutoTurns: number
  createdAt: string
  updatedAt: string
}

export type AppGroupWorkspaceMember = {
  workspaceId: string
  assistantId: string
  sortOrder: number
  createdAt: string
}

export type CreateGroupWorkspaceInput = {
  name: string
  rootPath: string
}

export type UpdateGroupWorkspaceInput = Partial<CreateGroupWorkspaceInput> & {
  groupDescription?: string
  maxAutoTurns?: number
}

function parseGroupWorkspaceRow(row: Record<string, unknown>): AppGroupWorkspace {
  return {
    id: String(row.id),
    name: String(row.name),
    rootPath: String(row.root_path),
    groupDescription: String(row.group_description),
    maxAutoTurns: Number(row.max_auto_turns),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function parseGroupWorkspaceMemberRow(row: Record<string, unknown>): AppGroupWorkspaceMember {
  return {
    workspaceId: String(row.workspace_id),
    assistantId: String(row.assistant_id),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at)
  }
}

export class GroupWorkspacesRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppGroupWorkspace[]> {
    const result = await this.db.execute(
      'SELECT id, name, root_path, group_description, max_auto_turns, created_at, updated_at FROM app_group_workspaces ORDER BY created_at DESC'
    )

    return result.rows.map((row) => parseGroupWorkspaceRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppGroupWorkspace | null> {
    const result = await this.db.execute(
      'SELECT id, name, root_path, group_description, max_auto_turns, created_at, updated_at FROM app_group_workspaces WHERE id = ? LIMIT 1',
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseGroupWorkspaceRow(row as Record<string, unknown>)
  }

  async create(input: CreateGroupWorkspaceInput): Promise<AppGroupWorkspace> {
    const id = randomUUID()
    await this.db.execute(
      'INSERT INTO app_group_workspaces (id, name, root_path) VALUES (?, ?, ?)',
      [id, input.name, input.rootPath]
    )

    const workspace = await this.getById(id)
    if (!workspace) {
      throw new Error('Failed to create group workspace')
    }

    return workspace
  }

  async update(id: string, input: UpdateGroupWorkspaceInput): Promise<AppGroupWorkspace | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    await this.db.execute(
      `
        UPDATE app_group_workspaces
        SET
          name = ?,
          root_path = ?,
          group_description = ?,
          max_auto_turns = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        input.name ?? existing.name,
        input.rootPath ?? existing.rootPath,
        input.groupDescription ?? existing.groupDescription,
        input.maxAutoTurns ?? existing.maxAutoTurns,
        id
      ]
    )

    return this.getById(id)
  }

  async listMembers(workspaceId: string): Promise<AppGroupWorkspaceMember[]> {
    const result = await this.db.execute(
      `
        SELECT workspace_id, assistant_id, sort_order, created_at
        FROM app_group_workspace_members
        WHERE workspace_id = ?
        ORDER BY sort_order ASC, created_at ASC
      `,
      [workspaceId]
    )

    return result.rows.map((row) => parseGroupWorkspaceMemberRow(row as Record<string, unknown>))
  }

  async replaceMembers(workspaceId: string, assistantIds: string[]): Promise<void> {
    const uniqueAssistantIds = assistantIds.filter(
      (assistantId, index) => assistantIds.indexOf(assistantId) === index
    )

    await this.db.execute('DELETE FROM app_group_workspace_members WHERE workspace_id = ?', [
      workspaceId
    ])

    for (const [index, assistantId] of uniqueAssistantIds.entries()) {
      await this.db.execute(
        'INSERT INTO app_group_workspace_members (workspace_id, assistant_id, sort_order) VALUES (?, ?, ?)',
        [workspaceId, assistantId, index]
      )
    }
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id)
    if (!existing) {
      return false
    }

    await this.db.execute('DELETE FROM app_group_workspaces WHERE id = ?', [id])
    return true
  }
}
