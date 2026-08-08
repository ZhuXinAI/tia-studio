import { randomUUID } from 'node:crypto'
import type { AgentMemory, SaveAgentMemoryInput } from '../../../shared/memory'
import type { AppDatabase } from '../client'

const COLUMNS = 'id, workspace_id, title, content, enabled, created_at, updated_at'

function parse(row: Record<string, unknown>): AgentMemory {
  return {
    id: String(row.id),
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    title: String(row.title),
    content: String(row.content),
    enabled: Number(row.enabled) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class MemoriesRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(workspaceId?: string | null): Promise<AgentMemory[]> {
    const result =
      workspaceId === undefined
        ? await this.db.execute(
            `SELECT ${COLUMNS} FROM app_memories ORDER BY updated_at DESC, rowid DESC`
          )
        : workspaceId === null
          ? await this.db.execute(
              `SELECT ${COLUMNS} FROM app_memories WHERE workspace_id IS NULL ORDER BY updated_at DESC, rowid DESC`
            )
          : await this.db.execute(
              `SELECT ${COLUMNS} FROM app_memories WHERE workspace_id = ? OR workspace_id IS NULL ORDER BY updated_at DESC, rowid DESC`,
              [workspaceId]
            )
    return result.rows.map((row) => parse(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AgentMemory | null> {
    const result = await this.db.execute(
      `SELECT ${COLUMNS} FROM app_memories WHERE id = ? LIMIT 1`,
      [id]
    )
    const row = result.rows.at(0)
    return row ? parse(row as Record<string, unknown>) : null
  }

  async create(input: SaveAgentMemoryInput): Promise<AgentMemory> {
    const id = randomUUID()
    await this.db.execute(
      `INSERT INTO app_memories (id, workspace_id, title, content, enabled) VALUES (?, ?, ?, ?, ?)`,
      [id, input.workspaceId, input.title, input.content, input.enabled ? 1 : 0]
    )
    const created = await this.getById(id)
    if (!created) throw new Error('Failed to create memory')
    return created
  }

  async update(id: string, input: SaveAgentMemoryInput): Promise<AgentMemory | null> {
    await this.db.execute(
      `UPDATE app_memories SET workspace_id = ?, title = ?, content = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [input.workspaceId, input.title, input.content, input.enabled ? 1 : 0, id]
    )
    return this.getById(id)
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM app_memories WHERE id = ?', [id])
    return Number(result.rowsAffected ?? 0) > 0
  }
}
