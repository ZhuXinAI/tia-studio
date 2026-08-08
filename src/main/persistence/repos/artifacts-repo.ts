import { randomUUID } from 'node:crypto'
import type { AgentArtifact, CreateAgentArtifactInput } from '../../../shared/artifacts'
import type { AppDatabase } from '../client'

const COLUMNS = `
  id, session_id, name, kind, mime_type, relative_path, url, size_bytes, preview_text,
  source_message_id, source_tool_call_id, source_tool_name, created_at
`
const DELIVERABLE_TOOL_NAME = 'createOrUpdateDeliverable'

function parse(row: Record<string, unknown>): AgentArtifact {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    name: String(row.name),
    kind: String(row.kind) as AgentArtifact['kind'],
    mimeType: row.mime_type ? String(row.mime_type) : undefined,
    relativePath: row.relative_path ? String(row.relative_path) : undefined,
    url: row.url ? String(row.url) : undefined,
    sizeBytes:
      row.size_bytes === null || row.size_bytes === undefined ? undefined : Number(row.size_bytes),
    previewText: row.preview_text ? String(row.preview_text) : undefined,
    sourceMessageId: row.source_message_id ? String(row.source_message_id) : undefined,
    sourceToolCallId: row.source_tool_call_id ? String(row.source_tool_call_id) : undefined,
    sourceToolName: row.source_tool_name ? String(row.source_tool_name) : undefined,
    createdAt: String(row.created_at)
  }
}

export class AgentArtifactsRepository {
  constructor(private readonly db: AppDatabase) {}

  async listBySession(sessionId: string): Promise<AgentArtifact[]> {
    const result = await this.db.execute(
      `SELECT ${COLUMNS} FROM app_artifacts
       WHERE session_id = ? AND source_tool_name = ?
       ORDER BY created_at DESC, rowid DESC`,
      [sessionId, DELIVERABLE_TOOL_NAME]
    )
    return result.rows.map((row) => parse(row as Record<string, unknown>))
  }

  async create(input: CreateAgentArtifactInput): Promise<AgentArtifact> {
    const id = input.id ?? randomUUID()
    const createdAt = input.createdAt ?? new Date().toISOString()
    await this.db.execute(
      `INSERT OR IGNORE INTO app_artifacts (
        id, session_id, name, kind, mime_type, relative_path, url, size_bytes, preview_text,
        source_message_id, source_tool_call_id, source_tool_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.sessionId,
        input.name,
        input.kind,
        input.mimeType ?? null,
        input.relativePath ?? null,
        input.url ?? null,
        input.sizeBytes ?? null,
        input.previewText ?? null,
        input.sourceMessageId ?? null,
        input.sourceToolCallId ?? null,
        input.sourceToolName ?? null,
        createdAt
      ]
    )
    const result = await this.db.execute(
      `SELECT ${COLUMNS} FROM app_artifacts WHERE id = ? LIMIT 1`,
      [id]
    )
    const row = result.rows.at(0)
    if (!row) throw new Error('Failed to create agent artifact')
    return parse(row as Record<string, unknown>)
  }

  async createOrUpdate(input: CreateAgentArtifactInput): Promise<AgentArtifact> {
    const id = input.id ?? randomUUID()
    const createdAt = input.createdAt ?? new Date().toISOString()
    const existing = await this.db.execute(
      'SELECT session_id FROM app_artifacts WHERE id = ? LIMIT 1',
      [id]
    )
    const existingRow = existing.rows.at(0) as Record<string, unknown> | undefined
    if (existingRow && String(existingRow.session_id) !== input.sessionId) {
      throw new Error('An artifact id cannot be reused across sessions')
    }

    await this.db.execute(
      `INSERT INTO app_artifacts (
        id, session_id, name, kind, mime_type, relative_path, url, size_bytes, preview_text,
        source_message_id, source_tool_call_id, source_tool_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        name = excluded.name,
        kind = excluded.kind,
        mime_type = excluded.mime_type,
        relative_path = excluded.relative_path,
        url = excluded.url,
        size_bytes = excluded.size_bytes,
        preview_text = excluded.preview_text,
        source_message_id = excluded.source_message_id,
        source_tool_call_id = excluded.source_tool_call_id,
        source_tool_name = excluded.source_tool_name,
        created_at = excluded.created_at`,
      [
        id,
        input.sessionId,
        input.name,
        input.kind,
        input.mimeType ?? null,
        input.relativePath ?? null,
        input.url ?? null,
        input.sizeBytes ?? null,
        input.previewText ?? null,
        input.sourceMessageId ?? null,
        input.sourceToolCallId ?? null,
        DELIVERABLE_TOOL_NAME,
        createdAt
      ]
    )
    const result = await this.db.execute(
      `SELECT ${COLUMNS} FROM app_artifacts WHERE id = ? LIMIT 1`,
      [id]
    )
    const row = result.rows.at(0)
    if (!row) throw new Error('Failed to create or update agent artifact')
    return parse(row as Record<string, unknown>)
  }
}
