import { randomUUID } from 'node:crypto'
import type { PermissionRule, PermissionRuleProposal } from '../../../shared/permission-rules'
import type { AppDatabase } from '../client'

function parseArgvPrefix(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []
  } catch {
    return []
  }
}

function parseRule(row: Record<string, unknown>): PermissionRule {
  return {
    id: String(row.id),
    workspacePath: String(row.workspace_path),
    tool: 'bash',
    decision: row.decision === 'deny' ? 'deny' : row.decision === 'ask' ? 'ask' : 'allow',
    argvPrefix: parseArgvPrefix(row.argv_prefix_json),
    rationale: String(row.rationale),
    origin:
      row.origin === 'built-in'
        ? 'built-in'
        : row.origin === 'user-config'
          ? 'user-config'
          : 'user-approval',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(row.last_used_at ? { lastUsedAt: String(row.last_used_at) } : {})
  }
}

const selectColumns =
  'id, workspace_path, tool, decision, argv_prefix_json, rationale, origin, created_at, updated_at, last_used_at'

export class PermissionRulesRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(workspacePath?: string): Promise<PermissionRule[]> {
    const result = workspacePath
      ? await this.db.execute(
          `SELECT ${selectColumns} FROM app_permission_rules WHERE workspace_path = ? ORDER BY updated_at DESC`,
          [workspacePath]
        )
      : await this.db.execute(
          `SELECT ${selectColumns} FROM app_permission_rules ORDER BY updated_at DESC`
        )
    return result.rows.map((row) => parseRule(row as Record<string, unknown>))
  }

  async createWorkspaceAllows(input: {
    workspacePath: string
    proposals: PermissionRuleProposal[]
    rationale: string
  }): Promise<PermissionRule[]> {
    const created: PermissionRule[] = []
    for (const proposal of input.proposals) {
      const existing = await this.db.execute(
        `SELECT ${selectColumns} FROM app_permission_rules
         WHERE workspace_path = ? AND tool = ? AND decision = 'allow' AND argv_prefix_json = ?
         LIMIT 1`,
        [input.workspacePath, proposal.tool, JSON.stringify(proposal.argvPrefix)]
      )
      const row = existing.rows.at(0)
      if (row) {
        created.push(parseRule(row as Record<string, unknown>))
        continue
      }
      const id = randomUUID()
      await this.db.execute(
        `INSERT INTO app_permission_rules
          (id, workspace_path, tool, decision, argv_prefix_json, rationale, origin)
         VALUES (?, ?, ?, 'allow', ?, ?, 'user-approval')`,
        [
          id,
          input.workspacePath,
          proposal.tool,
          JSON.stringify(proposal.argvPrefix),
          input.rationale
        ]
      )
      const inserted = await this.db.execute(
        `SELECT ${selectColumns} FROM app_permission_rules WHERE id = ? LIMIT 1`,
        [id]
      )
      const insertedRow = inserted.rows.at(0)
      if (insertedRow) created.push(parseRule(insertedRow as Record<string, unknown>))
    }
    return created
  }

  async touch(ids: string[]): Promise<void> {
    for (const id of [...new Set(ids)]) {
      await this.db.execute(
        'UPDATE app_permission_rules SET last_used_at = CURRENT_TIMESTAMP, updated_at = updated_at WHERE id = ?',
        [id]
      )
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM app_permission_rules WHERE id = ?', [id])
    return result.rowsAffected > 0
  }
}
