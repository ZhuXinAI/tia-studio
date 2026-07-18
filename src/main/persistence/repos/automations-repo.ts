import { randomUUID } from 'node:crypto'
import type { SaveTiaAutomationInput, TiaAutomationRecord } from '../../../shared/automations'
import { describeAutomationSchedule } from '../../../shared/automation-schedule'
import type { AppDatabase } from '../client'

const COLUMNS = `
  id, name, prompt, status, rrule, workspace_id, provider_id, model_id,
  next_run_at, last_run_at, last_session_id, last_error, created_at, updated_at
`

function parse(row: Record<string, unknown>): TiaAutomationRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    prompt: String(row.prompt),
    status: row.status === 'paused' ? 'paused' : 'active',
    rrule: String(row.rrule),
    workspaceId: String(row.workspace_id),
    providerId: String(row.provider_id),
    modelId: String(row.model_id),
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    lastSessionId: row.last_session_id ? String(row.last_session_id) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function nextRunAt(input: SaveTiaAutomationInput, now = new Date()): string | null {
  return input.status === 'active' ? describeAutomationSchedule(input.rrule, now).nextRunAt : null
}

export class AutomationsRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<TiaAutomationRecord[]> {
    const result = await this.db.execute(
      `SELECT ${COLUMNS} FROM app_automations ORDER BY created_at DESC`
    )
    return result.rows.map((row) => parse(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<TiaAutomationRecord | null> {
    const result = await this.db.execute(
      `SELECT ${COLUMNS} FROM app_automations WHERE id = ? LIMIT 1`,
      [id]
    )
    const row = result.rows.at(0)
    return row ? parse(row as Record<string, unknown>) : null
  }

  async create(input: SaveTiaAutomationInput): Promise<TiaAutomationRecord> {
    const id = randomUUID()
    await this.db.execute(
      `INSERT INTO app_automations (
        id, name, prompt, status, rrule, workspace_id, provider_id, model_id, next_run_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.prompt,
        input.status,
        input.rrule,
        input.workspaceId,
        input.providerId,
        input.modelId,
        nextRunAt(input)
      ]
    )
    const created = await this.getById(id)
    if (!created) throw new Error('Failed to create automation')
    return created
  }

  async update(id: string, input: SaveTiaAutomationInput): Promise<TiaAutomationRecord | null> {
    await this.db.execute(
      `UPDATE app_automations SET
        name = ?, prompt = ?, status = ?, rrule = ?, workspace_id = ?, provider_id = ?,
        model_id = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        input.name,
        input.prompt,
        input.status,
        input.rrule,
        input.workspaceId,
        input.providerId,
        input.modelId,
        nextRunAt(input),
        id
      ]
    )
    return this.getById(id)
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM app_automations WHERE id = ?', [id])
    return Number(result.rowsAffected ?? 0) > 0
  }

  async listDue(now = new Date()): Promise<TiaAutomationRecord[]> {
    const result = await this.db.execute(
      `SELECT ${COLUMNS} FROM app_automations
       WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ?
       ORDER BY next_run_at ASC`,
      [now.toISOString()]
    )
    return result.rows.map((row) => parse(row as Record<string, unknown>))
  }

  async recordRun(
    id: string,
    input: { lastRunAt: string; nextRunAt: string | null; sessionId?: string; error?: string }
  ): Promise<void> {
    await this.db.execute(
      `UPDATE app_automations SET
        last_run_at = ?, next_run_at = ?, last_session_id = ?, last_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [input.lastRunAt, input.nextRunAt, input.sessionId ?? null, input.error ?? null, id]
    )
  }
}
