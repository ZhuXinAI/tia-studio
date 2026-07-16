import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../client'

const BUILT_IN_DEFAULT_WORKSPACE_PREFERENCE_KEY = 'built_in_default_workspace_id'

export type AppStoredWorkspace = {
  id: string
  name: string
  rootPath: string
  description: string
  supervisorProviderId: string | null
  supervisorModel: string
  createdAt: string
  updatedAt: string
}

export type CreateWorkspaceRecordInput = {
  name: string
  rootPath: string
}

export type UpdateWorkspaceRecordInput = Partial<CreateWorkspaceRecordInput> & {
  description?: string
  supervisorProviderId?: string | null
  supervisorModel?: string
}

function parseWorkspaceRow(row: Record<string, unknown>): AppStoredWorkspace {
  return {
    id: String(row.id),
    name: String(row.name),
    rootPath: String(row.root_path),
    description: String(row.description),
    supervisorProviderId: row.supervisor_provider_id ? String(row.supervisor_provider_id) : null,
    supervisorModel: String(row.supervisor_model),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class WorkspaceRecordsRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AppStoredWorkspace[]> {
    const builtInWorkspaceId = await this.getBuiltInDefaultWorkspaceId()
    const result = await this.db.execute(
      'SELECT id, name, root_path, description, supervisor_provider_id, supervisor_model, created_at, updated_at FROM app_workspaces ORDER BY created_at DESC'
    )

    const workspaces = result.rows.map((row) => parseWorkspaceRow(row as Record<string, unknown>))

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

  async getById(id: string): Promise<AppStoredWorkspace | null> {
    const result = await this.db.execute(
      'SELECT id, name, root_path, description, supervisor_provider_id, supervisor_model, created_at, updated_at FROM app_workspaces WHERE id = ? LIMIT 1',
      [id]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseWorkspaceRow(row as Record<string, unknown>)
  }

  async findByRootPath(rootPath: string): Promise<AppStoredWorkspace | null> {
    const result = await this.db.execute(
      `
        SELECT id, name, root_path, description, supervisor_provider_id, supervisor_model, created_at, updated_at
        FROM app_workspaces
        WHERE root_path = ?
        LIMIT 1
      `,
      [rootPath]
    )
    const row = result.rows.at(0)

    if (!row) {
      return null
    }

    return parseWorkspaceRow(row as Record<string, unknown>)
  }

  async getBuiltInDefaultWorkspaceId(): Promise<string | null> {
    const result = await this.db.execute(
      'SELECT value FROM app_preferences WHERE key = ? LIMIT 1',
      [BUILT_IN_DEFAULT_WORKSPACE_PREFERENCE_KEY]
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
      [BUILT_IN_DEFAULT_WORKSPACE_PREFERENCE_KEY, workspaceId]
    )
  }

  async isBuiltInDefaultWorkspace(workspaceId: string): Promise<boolean> {
    const builtInWorkspaceId = await this.getBuiltInDefaultWorkspaceId()
    return builtInWorkspaceId === workspaceId
  }

  async create(input: CreateWorkspaceRecordInput): Promise<AppStoredWorkspace> {
    const id = randomUUID()
    await this.db.execute('INSERT INTO app_workspaces (id, name, root_path) VALUES (?, ?, ?)', [
      id,
      input.name,
      input.rootPath
    ])

    const workspace = await this.getById(id)
    if (!workspace) {
      throw new Error('Failed to create workspace')
    }

    return workspace
  }

  async update(id: string, input: UpdateWorkspaceRecordInput): Promise<AppStoredWorkspace | null> {
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
        UPDATE app_workspaces
        SET
          name = ?,
          root_path = ?,
          description = ?,
          supervisor_provider_id = ?,
          supervisor_model = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        input.name ?? existing.name,
        input.rootPath ?? existing.rootPath,
        input.description ?? existing.description,
        supervisorProviderId,
        input.supervisorModel ?? existing.supervisorModel,
        id
      ]
    )

    return this.getById(id)
  }

  async delete(id: string): Promise<boolean> {
    if (await this.isBuiltInDefaultWorkspace(id)) {
      return false
    }

    const existing = await this.getById(id)
    if (!existing) {
      return false
    }

    await this.db.execute('DELETE FROM app_workspaces WHERE id = ?', [id])
    return true
  }
}
