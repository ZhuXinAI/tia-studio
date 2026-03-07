import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

export type AppTeamWorkspace = {
  id: string
  name: string
  rootPath: string
  createdAt: string
  updatedAt: string
}

export type CreateTeamWorkspaceInput = {
  name: string
  rootPath: string
}

export type UpdateTeamWorkspaceInput = Partial<CreateTeamWorkspaceInput>

function parseTeamWorkspaceRow(row: Record<string, unknown>): AppTeamWorkspace {
  return {
    id: String(row.id),
    name: String(row.name),
    rootPath: String(row.root_path),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class TeamWorkspacesRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppTeamWorkspace[]> {
    const result = await this.db.execute(
      'SELECT id, name, root_path, created_at, updated_at FROM app_team_workspaces ORDER BY created_at DESC'
    )

    return result.rows.map((row) => parseTeamWorkspaceRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AppTeamWorkspace | null> {
    const result = await this.db.execute(
      'SELECT id, name, root_path, created_at, updated_at FROM app_team_workspaces WHERE id = ? LIMIT 1',
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseTeamWorkspaceRow(row as Record<string, unknown>)
  }

  async create(input: CreateTeamWorkspaceInput): Promise<AppTeamWorkspace> {
    const id = randomUUID()
    await this.db.execute(
      'INSERT INTO app_team_workspaces (id, name, root_path) VALUES (?, ?, ?)',
      [id, input.name, input.rootPath]
    )

    const workspace = await this.getById(id)
    if (!workspace) {
      throw new Error('Failed to create team workspace')
    }

    return workspace
  }

  async update(id: string, input: UpdateTeamWorkspaceInput): Promise<AppTeamWorkspace | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    await this.db.execute(
      'UPDATE app_team_workspaces SET name = ?, root_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [input.name ?? existing.name, input.rootPath ?? existing.rootPath, id]
    )

    return this.getById(id)
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id)
    if (!existing) {
      return false
    }

    await this.db.execute('DELETE FROM app_team_workspaces WHERE id = ?', [id])
    return true
  }
}
