import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

const BUILT_IN_DEFAULT_TEAM_WORKSPACE_PREFERENCE_KEY = 'built_in_default_team_workspace_id'

export type AppTeamWorkspace = {
  id: string
  name: string
  rootPath: string
  teamDescription: string
  supervisorProviderId: string | null
  supervisorModel: string
  createdAt: string
  updatedAt: string
}

export type AppTeamWorkspaceMember = {
  workspaceId: string
  assistantId: string
  sortOrder: number
  createdAt: string
}

export type CreateTeamWorkspaceInput = {
  name: string
  rootPath: string
}

export type UpdateTeamWorkspaceInput = Partial<CreateTeamWorkspaceInput> & {
  teamDescription?: string
  supervisorProviderId?: string | null
  supervisorModel?: string
}

function parseTeamWorkspaceRow(row: Record<string, unknown>): AppTeamWorkspace {
  return {
    id: String(row.id),
    name: String(row.name),
    rootPath: String(row.root_path),
    teamDescription: String(row.team_description),
    supervisorProviderId: row.supervisor_provider_id ? String(row.supervisor_provider_id) : null,
    supervisorModel: String(row.supervisor_model),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function parseTeamWorkspaceMemberRow(row: Record<string, unknown>): AppTeamWorkspaceMember {
  return {
    workspaceId: String(row.workspace_id),
    assistantId: String(row.assistant_id),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at)
  }
}

function parseBuiltInAssistantMemberRow(
  workspaceId: string,
  row: Record<string, unknown>,
  sortOrder: number
): AppTeamWorkspaceMember {
  return {
    workspaceId,
    assistantId: String(row.id),
    sortOrder,
    createdAt: String(row.created_at)
  }
}

export class TeamWorkspacesRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppTeamWorkspace[]> {
    const builtInWorkspaceId = await this.getBuiltInDefaultWorkspaceId()
    const result = await this.db.execute(
      'SELECT id, name, root_path, team_description, supervisor_provider_id, supervisor_model, created_at, updated_at FROM app_team_workspaces ORDER BY created_at DESC'
    )

    const workspaces = result.rows.map((row) =>
      parseTeamWorkspaceRow(row as Record<string, unknown>)
    )

    if (!builtInWorkspaceId) {
      return workspaces
    }

    return [...workspaces].sort((left, right) => {
      if (left.id === builtInWorkspaceId) {
        return -1
      }

      if (right.id === builtInWorkspaceId) {
        return 1
      }

      return Date.parse(right.createdAt) - Date.parse(left.createdAt)
    })
  }

  async getById(id: string): Promise<AppTeamWorkspace | null> {
    const result = await this.db.execute(
      'SELECT id, name, root_path, team_description, supervisor_provider_id, supervisor_model, created_at, updated_at FROM app_team_workspaces WHERE id = ? LIMIT 1',
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseTeamWorkspaceRow(row as Record<string, unknown>)
  }

  async findByRootPath(rootPath: string): Promise<AppTeamWorkspace | null> {
    const result = await this.db.execute(
      `
        SELECT id, name, root_path, team_description, supervisor_provider_id, supervisor_model, created_at, updated_at
        FROM app_team_workspaces
        WHERE root_path = ?
        LIMIT 1
      `,
      [rootPath]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseTeamWorkspaceRow(row as Record<string, unknown>)
  }

  async getBuiltInDefaultWorkspaceId(): Promise<string | null> {
    const result = await this.db.execute(
      'SELECT value FROM app_preferences WHERE key = ? LIMIT 1',
      [BUILT_IN_DEFAULT_TEAM_WORKSPACE_PREFERENCE_KEY]
    )
    const row = result.rows.at(0) as Record<string, unknown> | undefined
    const value = typeof row?.value === 'string' ? row.value.trim() : ''

    return value.length > 0 ? value : null
  }

  async setBuiltInDefaultWorkspaceId(workspaceId: string): Promise<void> {
    await this.db.execute(
      `
        INSERT INTO app_preferences (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `,
      [BUILT_IN_DEFAULT_TEAM_WORKSPACE_PREFERENCE_KEY, workspaceId]
    )
  }

  async isBuiltInDefaultWorkspace(workspaceId: string): Promise<boolean> {
    const builtInWorkspaceId = await this.getBuiltInDefaultWorkspaceId()
    return builtInWorkspaceId === workspaceId
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

    const supervisorProviderId =
      'supervisorProviderId' in input
        ? (input.supervisorProviderId ?? null)
        : existing.supervisorProviderId

    await this.db.execute(
      `
        UPDATE app_team_workspaces
        SET
          name = ?,
          root_path = ?,
          team_description = ?,
          supervisor_provider_id = ?,
          supervisor_model = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        input.name ?? existing.name,
        input.rootPath ?? existing.rootPath,
        input.teamDescription ?? existing.teamDescription,
        supervisorProviderId,
        input.supervisorModel ?? existing.supervisorModel,
        id
      ]
    )

    return this.getById(id)
  }

  async listMembers(workspaceId: string): Promise<AppTeamWorkspaceMember[]> {
    if (await this.isBuiltInDefaultWorkspace(workspaceId)) {
      const assistantsResult = await this.db.execute(
        `
          SELECT id, created_at
          FROM app_assistants
          ORDER BY created_at ASC
        `
      )

      return assistantsResult.rows.map((row, index) =>
        parseBuiltInAssistantMemberRow(workspaceId, row as Record<string, unknown>, index)
      )
    }

    const result = await this.db.execute(
      `
        SELECT workspace_id, assistant_id, sort_order, created_at
        FROM app_team_workspace_members
        WHERE workspace_id = ?
        ORDER BY sort_order ASC, created_at ASC
      `,
      [workspaceId]
    )

    return result.rows.map((row) => parseTeamWorkspaceMemberRow(row as Record<string, unknown>))
  }

  async replaceMembers(workspaceId: string, assistantIds: string[]): Promise<void> {
    if (await this.isBuiltInDefaultWorkspace(workspaceId)) {
      return
    }

    const uniqueAssistantIds = assistantIds.filter(
      (assistantId, index) => assistantIds.indexOf(assistantId) === index
    )

    await this.db.execute('DELETE FROM app_team_workspace_members WHERE workspace_id = ?', [
      workspaceId
    ])

    for (const [index, assistantId] of uniqueAssistantIds.entries()) {
      await this.db.execute(
        'INSERT INTO app_team_workspace_members (workspace_id, assistant_id, sort_order) VALUES (?, ?, ?)',
        [workspaceId, assistantId, index]
      )
    }
  }

  async delete(id: string): Promise<boolean> {
    if (await this.isBuiltInDefaultWorkspace(id)) {
      return false
    }

    const existing = await this.getById(id)
    if (!existing) {
      return false
    }

    await this.db.execute('DELETE FROM app_team_workspaces WHERE id = ?', [id])
    return true
  }
}
