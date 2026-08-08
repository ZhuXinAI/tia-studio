import { randomUUID } from 'node:crypto'
import type { AutomationRunRecord, AutomationRunStatus } from '../../../shared/automation-runs'
import type { AppDatabase } from '../client'

const COLUMNS = 'id, automation_id, session_id, status, started_at, completed_at, summary, error'

function parse(row: Record<string, unknown>): AutomationRunRecord {
  return {
    id: String(row.id),
    automationId: String(row.automation_id),
    sessionId: row.session_id ? String(row.session_id) : null,
    status: String(row.status) as AutomationRunStatus,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    summary: row.summary ? String(row.summary) : null,
    error: row.error ? String(row.error) : null
  }
}

export class AutomationRunsRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(input: { automationId: string; startedAt?: string }): Promise<AutomationRunRecord> {
    const id = randomUUID()
    await this.db.execute(
      `INSERT INTO app_automation_runs (id, automation_id, status, started_at) VALUES (?, ?, 'running', ?)`,
      [id, input.automationId, input.startedAt ?? new Date().toISOString()]
    )
    const created = await this.getById(id)
    if (!created) throw new Error('Failed to create automation run')
    return created
  }

  async getById(id: string): Promise<AutomationRunRecord | null> {
    const result = await this.db.execute(
      `SELECT ${COLUMNS} FROM app_automation_runs WHERE id = ? LIMIT 1`,
      [id]
    )
    const row = result.rows.at(0)
    return row ? parse(row as Record<string, unknown>) : null
  }

  async listByAutomation(automationId: string): Promise<AutomationRunRecord[]> {
    const result = await this.db.execute(
      `SELECT ${COLUMNS} FROM app_automation_runs WHERE automation_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 100`,
      [automationId]
    )
    return result.rows.map((row) => parse(row as Record<string, unknown>))
  }

  async listNeedsReview(): Promise<AutomationRunRecord[]> {
    const result = await this.db.execute(
      `SELECT ${COLUMNS} FROM app_automation_runs WHERE status = 'needs-review' ORDER BY started_at DESC, rowid DESC LIMIT 100`
    )
    return result.rows.map((row) => parse(row as Record<string, unknown>))
  }

  async update(
    id: string,
    input: Partial<Pick<AutomationRunRecord, 'sessionId' | 'status' | 'completedAt' | 'summary' | 'error'>>
  ): Promise<AutomationRunRecord | null> {
    const existing = await this.getById(id)
    if (!existing) return null
    await this.db.execute(
      `UPDATE app_automation_runs SET session_id = ?, status = ?, completed_at = ?, summary = ?, error = ? WHERE id = ?`,
      [
        input.sessionId ?? existing.sessionId,
        input.status ?? existing.status,
        input.completedAt ?? existing.completedAt,
        input.summary ?? existing.summary,
        input.error ?? existing.error,
        id
      ]
    )
    return this.getById(id)
  }

  async markReviewed(id: string): Promise<AutomationRunRecord | null> {
    const existing = await this.getById(id)
    if (!existing) return null
    if (existing.status !== 'needs-review') {
      throw new Error('Automation run is not awaiting review')
    }
    return this.update(id, {
      status: 'completed',
      completedAt: existing.completedAt ?? new Date().toISOString(),
      summary: existing.summary ?? 'Reviewed by user'
    })
  }
}
