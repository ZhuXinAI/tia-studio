import { randomUUID } from 'node:crypto'
import type {
  AgentAccessMode,
  AgentSessionSnapshot,
  AgentSessionStatus,
  AgentThinkingLevel,
  AppAgentEvent,
  AppAgentMessage,
  AgentInteractionRequest,
  CreateAgentSessionInput
} from '../../../shared/agent-runtime'
import type { AppDatabase } from '../client'

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function parseSession(row: Record<string, unknown>): AgentSessionSnapshot {
  return {
    id: String(row.id),
    upstreamSessionId: row.upstream_session_id ? String(row.upstream_session_id) : undefined,
    upstreamSessionFile: row.upstream_session_file ? String(row.upstream_session_file) : undefined,
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    workspacePath: String(row.workspace_path),
    title: String(row.title),
    providerId: String(row.provider_id),
    provider: String(row.provider),
    modelId: String(row.model_id),
    thinkingLevel: String(row.thinking_level) as AgentThinkingLevel,
    accessMode: String(row.access_mode) as AgentAccessMode,
    pinned: Number(row.pinned) === 1,
    status: String(row.status) as AgentSessionStatus,
    isCompacting: Number(row.is_compacting) === 1,
    queue: json(String(row.queue_json ?? '{}'), { steering: [], followUps: [] }),
    pendingInteraction: row.pending_interaction_json
      ? json(String(row.pending_interaction_json), undefined)
      : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

const SESSION_COLUMNS = `
  id, upstream_session_id, upstream_session_file, workspace_id, workspace_path, title,
  provider_id, provider, model_id, thinking_level, access_mode, pinned, status, is_compacting,
  queue_json, pending_interaction_json, created_at, updated_at
`

export class AgentSessionsRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<AgentSessionSnapshot[]> {
    const result = await this.db.execute(
      `SELECT ${SESSION_COLUMNS} FROM app_agent_sessions ORDER BY updated_at DESC, rowid DESC`
    )
    return result.rows.map((row) => parseSession(row as Record<string, unknown>))
  }

  async listByWorkspace(workspaceId: string | null): Promise<AgentSessionSnapshot[]> {
    const result = workspaceId
      ? await this.db.execute(
          `SELECT ${SESSION_COLUMNS} FROM app_agent_sessions WHERE workspace_id = ? ORDER BY updated_at DESC, rowid DESC`,
          [workspaceId]
        )
      : await this.db.execute(
          `SELECT ${SESSION_COLUMNS} FROM app_agent_sessions WHERE workspace_id IS NULL ORDER BY updated_at DESC, rowid DESC`
        )
    return result.rows.map((row) => parseSession(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<AgentSessionSnapshot | null> {
    const result = await this.db.execute(
      `SELECT ${SESSION_COLUMNS} FROM app_agent_sessions WHERE id = ? LIMIT 1`,
      [id]
    )
    const row = result.rows.at(0)
    return row ? parseSession(row as Record<string, unknown>) : null
  }

  async create(input: CreateAgentSessionInput): Promise<AgentSessionSnapshot> {
    const id = randomUUID()
    const title = input.title?.trim() || 'New thread'
    await this.db.execute(
      `
        INSERT INTO app_agent_sessions (
          id, workspace_id, workspace_path, title, provider_id, provider, model_id,
          thinking_level, access_mode, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'starting')
      `,
      [
        id,
        input.workspaceId,
        input.workspacePath,
        title,
        input.providerId,
        input.provider,
        input.modelId,
        input.thinkingLevel ?? 'medium',
        input.accessMode ?? 'standard'
      ]
    )
    const created = await this.getById(id)
    if (!created) throw new Error('Failed to create Pi session record')
    return created
  }

  async update(
    id: string,
    input: Partial<
      Pick<
        AgentSessionSnapshot,
        | 'upstreamSessionId'
        | 'upstreamSessionFile'
        | 'title'
        | 'provider'
        | 'modelId'
        | 'thinkingLevel'
        | 'accessMode'
        | 'pinned'
        | 'status'
        | 'isCompacting'
        | 'queue'
      >
    > & { pendingInteraction?: AgentInteractionRequest | null }
  ): Promise<AgentSessionSnapshot | null> {
    const existing = await this.getById(id)
    if (!existing) return null
    await this.db.execute(
      `
        UPDATE app_agent_sessions SET
          upstream_session_id = ?, upstream_session_file = ?, title = ?, provider = ?,
          model_id = ?, thinking_level = ?, access_mode = ?, pinned = ?, status = ?, is_compacting = ?,
          queue_json = ?, pending_interaction_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        input.upstreamSessionId ?? existing.upstreamSessionId ?? null,
        input.upstreamSessionFile ?? existing.upstreamSessionFile ?? null,
        input.title ?? existing.title,
        input.provider ?? existing.provider,
        input.modelId ?? existing.modelId,
        input.thinkingLevel ?? existing.thinkingLevel,
        input.accessMode ?? existing.accessMode,
        (input.pinned ?? existing.pinned) ? 1 : 0,
        input.status ?? existing.status,
        (input.isCompacting ?? existing.isCompacting) ? 1 : 0,
        JSON.stringify(input.queue ?? existing.queue),
        'pendingInteraction' in input
          ? input.pendingInteraction
            ? JSON.stringify(input.pendingInteraction)
            : null
          : existing.pendingInteraction
            ? JSON.stringify(existing.pendingInteraction)
            : null,
        id
      ]
    )
    return this.getById(id)
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM app_agent_sessions WHERE id = ?', [id])
    return Number(result.rowsAffected ?? 0) > 0
  }

  async appendMessage(message: AppAgentMessage): Promise<void> {
    await this.db.execute(
      `
        INSERT INTO app_agent_messages (id, session_id, role, parts_json, status, upstream_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          parts_json = excluded.parts_json,
          status = excluded.status,
          upstream_id = excluded.upstream_id
      `,
      [
        message.id,
        message.sessionId,
        message.role,
        JSON.stringify(message.parts),
        message.status,
        message.upstreamId ?? null,
        message.createdAt
      ]
    )
  }

  async listMessages(sessionId: string): Promise<AppAgentMessage[]> {
    const result = await this.db.execute(
      `
        SELECT id, session_id, role, parts_json, status, upstream_id, created_at
        FROM app_agent_messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC
      `,
      [sessionId]
    )
    return result.rows.map((row) => {
      const record = row as Record<string, unknown>
      return {
        id: String(record.id),
        sessionId: String(record.session_id),
        role: String(record.role) as AppAgentMessage['role'],
        parts: json(String(record.parts_json), []),
        status: String(record.status) as AppAgentMessage['status'],
        upstreamId: record.upstream_id ? String(record.upstream_id) : undefined,
        createdAt: String(record.created_at)
      }
    })
  }

  async appendEvent(event: AppAgentEvent): Promise<boolean> {
    const result = await this.db.execute(
      `
        INSERT OR IGNORE INTO app_agent_events (
          event_id, session_id, sequence, event_type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        event.eventId,
        event.sessionId,
        event.sequence,
        event.type,
        JSON.stringify(event),
        event.timestamp
      ]
    )
    return Number(result.rowsAffected ?? 0) > 0
  }

  async getLastSequence(sessionId: string): Promise<number> {
    const result = await this.db.execute(
      'SELECT MAX(sequence) AS last_sequence FROM app_agent_events WHERE session_id = ?',
      [sessionId]
    )
    return Number((result.rows.at(0) as Record<string, unknown> | undefined)?.last_sequence ?? 0)
  }
}
