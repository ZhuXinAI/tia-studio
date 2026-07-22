import { readFile } from 'node:fs/promises'
import { createAppDatabase, type AppDatabase } from './client'
import { APP_CORE_MIGRATION_SQL } from './migrations/0001_app_core'
import { inferKnownModelContextWindowTokens } from '../utils/model-context-windows'

const MIGRATION_FILE = new URL('./migrations/0001_app_core.sql', import.meta.url)
const V3_MARKER = 'schema.pi_harness_v3'

function statements(sql: string): string[] {
  return sql
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
}

async function hasColumn(db: AppDatabase, table: string, column: string): Promise<boolean> {
  const result = await db.execute(`PRAGMA table_info('${table}')`)
  return result.rows.some((row) => String((row as Record<string, unknown>).name) === column)
}

async function addColumn(db: AppDatabase, table: string, column: string, definition: string) {
  if (!(await hasColumn(db, table, column))) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

async function ensureProviderColumns(db: AppDatabase): Promise<void> {
  await addColumn(db, 'app_providers', 'selected_model_context_window_tokens', 'INTEGER')
  await addColumn(db, 'app_providers', 'supports_vision', 'INTEGER NOT NULL DEFAULT 0')
  await addColumn(db, 'app_providers', 'is_built_in', 'INTEGER NOT NULL DEFAULT 0')
  await addColumn(db, 'app_providers', 'is_added', 'INTEGER NOT NULL DEFAULT 1')
  await addColumn(db, 'app_providers', 'is_default', 'INTEGER NOT NULL DEFAULT 0')
  await addColumn(db, 'app_providers', 'icon', 'TEXT')
  await addColumn(db, 'app_providers', 'official_site', 'TEXT')
}

async function ensureChannelColumns(db: AppDatabase): Promise<void> {
  await addColumn(
    db,
    'app_channels',
    'workspace_id',
    'TEXT REFERENCES app_workspaces(id) ON DELETE SET NULL'
  )
}

async function runDestructiveV3Cutover(db: AppDatabase): Promise<void> {
  const marker = await db.execute('SELECT value FROM app_preferences WHERE key = ? LIMIT 1', [
    V3_MARKER
  ])
  if (marker.rows.length > 0) return

  await db.execute('PRAGMA foreign_keys = OFF')
  await db.execute('DELETE FROM app_agent_events')
  await db.execute('DELETE FROM app_agent_messages')
  await db.execute('DELETE FROM app_agent_sessions')
  await db.execute('DROP TABLE IF EXISTS app_channel_session_bindings')
  await db.execute('DROP TABLE IF EXISTS app_channel_thread_bindings')

  await db.execute(`
    CREATE TABLE app_channels_v3 (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      workspace_id TEXT,
      config TEXT NOT NULL DEFAULT '{}',
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES app_workspaces(id) ON DELETE SET NULL
    )
  `)
  await db.execute(`
    INSERT INTO app_channels_v3 (id, type, name, enabled, workspace_id, config, last_error, created_at, updated_at)
    SELECT id, type, name, enabled, workspace_id, config, last_error, created_at, updated_at FROM app_channels
  `)
  await db.execute('DROP TABLE app_channels')
  await db.execute('ALTER TABLE app_channels_v3 RENAME TO app_channels')

  for (const table of [
    'app_thread_usage_totals',
    'app_thread_message_usage',
    'app_workspace_members',
    'app_threads',
    'app_assistants',
    'app_group_thread_assistant_threads',
    'app_group_thread_messages',
    'app_group_threads',
    'app_group_workspace_members',
    'app_group_workspaces',
    'app_team_thread_members',
    'app_team_workspace_members',
    'app_team_threads',
    'app_team_workspaces'
  ]) {
    await db.execute(`DROP TABLE IF EXISTS ${table}`)
  }
  await db.execute(
    "DELETE FROM app_preferences WHERE key IN ('security.prompt_injection_enabled', 'security.pii_detection_enabled', 'security.guardrail_provider_id')"
  )
  await db.execute(
    `INSERT INTO app_preferences (key, value, updated_at) VALUES (?, 'complete', CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [V3_MARKER]
  )
  await db.execute('PRAGMA foreign_keys = ON')
}

async function backfillKnownContextWindows(db: AppDatabase): Promise<void> {
  const result = await db.execute(
    'SELECT id, selected_model, selected_model_context_window_tokens FROM app_providers'
  )
  for (const row of result.rows) {
    const record = row as Record<string, unknown>
    if (Number(record.selected_model_context_window_tokens) > 0) continue
    const inferred = inferKnownModelContextWindowTokens(String(record.selected_model ?? ''))
    if (inferred) {
      await db.execute(
        'UPDATE app_providers SET selected_model_context_window_tokens = ? WHERE id = ?',
        [inferred, String(record.id)]
      )
    }
  }
}

async function ensureAutomationsTable(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      rrule TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      next_run_at TEXT,
      last_run_at TEXT,
      last_session_id TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES app_workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES app_providers(id),
      FOREIGN KEY (last_session_id) REFERENCES app_agent_sessions(id) ON DELETE SET NULL
    )
  `)
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_automations_due ON app_automations(status, next_run_at)'
  )
  await db.execute(`
    UPDATE app_agent_sessions
    SET automation_id = (
      SELECT app_automations.id
      FROM app_automations
      WHERE app_automations.last_session_id = app_agent_sessions.id
      LIMIT 1
    )
    WHERE automation_id IS NULL
      AND EXISTS (
        SELECT 1 FROM app_automations
        WHERE app_automations.last_session_id = app_agent_sessions.id
      )
  `)
  // Older schedules retained only their latest session ID. Recover historical runs that still
  // have the schedule's original title; future runs persist automation_id when they are created.
  await db.execute(`
    UPDATE app_agent_sessions
    SET automation_id = (
      SELECT app_automations.id
      FROM app_automations
      WHERE app_automations.name = app_agent_sessions.title
      LIMIT 1
    )
    WHERE automation_id IS NULL
      AND EXISTS (
        SELECT 1 FROM app_automations
        WHERE app_automations.name = app_agent_sessions.title
      )
  `)
}

async function ensurePermissionRulesTable(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_permission_rules (
      id TEXT PRIMARY KEY,
      workspace_path TEXT NOT NULL,
      tool TEXT NOT NULL,
      decision TEXT NOT NULL,
      argv_prefix_json TEXT NOT NULL,
      rationale TEXT NOT NULL,
      origin TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT
    )
  `)
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_permission_rules_workspace ON app_permission_rules(workspace_path, updated_at DESC)'
  )
}

export async function migrateAppSchema(pathOrUrl: string): Promise<AppDatabase> {
  const db = createAppDatabase(pathOrUrl)
  await db.execute('PRAGMA foreign_keys = ON')
  let sql = APP_CORE_MIGRATION_SQL
  try {
    sql = await readFile(MIGRATION_FILE, 'utf8')
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }
  for (const statement of statements(sql)) await db.execute(statement)
  await ensureProviderColumns(db)
  await ensureChannelColumns(db)
  await addColumn(db, 'app_agent_sessions', 'automation_id', 'TEXT')
  await addColumn(db, 'app_agent_sessions', 'pinned', 'INTEGER NOT NULL DEFAULT 0')
  await addColumn(db, 'app_agent_sessions', 'todos_json', "TEXT NOT NULL DEFAULT '[]'")
  await addColumn(db, 'app_agent_messages', 'completed_at', 'TEXT')
  await ensureAutomationsTable(db)
  await ensurePermissionRulesTable(db)
  await runDestructiveV3Cutover(db)
  for (const statement of statements(sql)) await db.execute(statement)
  await backfillKnownContextWindows(db)
  return db
}
