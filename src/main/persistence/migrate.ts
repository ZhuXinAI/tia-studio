import { readFile } from 'node:fs/promises'
import { createAppDatabase, type AppDatabase } from './client'
import { APP_CORE_MIGRATION_SQL } from './migrations/0001_app_core'

const MIGRATION_FILE = new URL('./migrations/0001_app_core.sql', import.meta.url)

function parseStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

function isMissingColumnIndexError(statement: string, error: unknown): boolean {
  if (!statement.startsWith('CREATE INDEX IF NOT EXISTS')) {
    return false
  }

  return error instanceof Error && /no such column/i.test(error.message)
}

async function ensureAssistantMaxStepsColumn(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_assistants')")
  const hasMaxStepsColumn = tableInfo.rows.some((row) => {
    return String((row as Record<string, unknown>).name) === 'max_steps'
  })

  if (hasMaxStepsColumn) {
    return
  }

  await db.execute('ALTER TABLE app_assistants ADD COLUMN max_steps INTEGER NOT NULL DEFAULT 100')
}

async function ensureAssistantDescriptionColumn(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_assistants')")
  const hasDescriptionColumn = tableInfo.rows.some((row) => {
    return String((row as Record<string, unknown>).name) === 'description'
  })

  if (hasDescriptionColumn) {
    return
  }

  await db.execute("ALTER TABLE app_assistants ADD COLUMN description TEXT NOT NULL DEFAULT ''")
}

async function ensureAssistantEnabledColumn(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_assistants')")
  const hasEnabledColumn = tableInfo.rows.some((row) => {
    return String((row as Record<string, unknown>).name) === 'enabled'
  })

  if (hasEnabledColumn) {
    return
  }

  await db.execute('ALTER TABLE app_assistants ADD COLUMN enabled INTEGER NOT NULL DEFAULT 0')
}

async function ensureProviderSupportsVisionColumn(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_providers')")
  const hasSupportsVisionColumn = tableInfo.rows.some((row) => {
    return String((row as Record<string, unknown>).name) === 'supports_vision'
  })

  if (hasSupportsVisionColumn) {
    return
  }

  await db.execute(
    'ALTER TABLE app_providers ADD COLUMN supports_vision INTEGER NOT NULL DEFAULT 0'
  )
}

async function ensureBuiltInProviderColumns(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_providers')")
  const columns = tableInfo.rows.map((row) => String((row as Record<string, unknown>).name))

  if (!columns.includes('is_built_in')) {
    await db.execute('ALTER TABLE app_providers ADD COLUMN is_built_in INTEGER NOT NULL DEFAULT 0')
  }

  if (!columns.includes('icon')) {
    await db.execute('ALTER TABLE app_providers ADD COLUMN icon TEXT')
  }

  if (!columns.includes('official_site')) {
    await db.execute('ALTER TABLE app_providers ADD COLUMN official_site TEXT')
  }
}

async function ensureWorkspaceTables(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      supervisor_provider_id TEXT,
      supervisor_model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supervisor_provider_id) REFERENCES app_providers(id)
    )
  `)

  const workspaceTableInfo = await db.execute("PRAGMA table_info('app_workspaces')")
  const workspaceColumns = workspaceTableInfo.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )

  if (!workspaceColumns.includes('description')) {
    await db.execute("ALTER TABLE app_workspaces ADD COLUMN description TEXT NOT NULL DEFAULT ''")
  }

  if (!workspaceColumns.includes('supervisor_provider_id')) {
    await db.execute('ALTER TABLE app_workspaces ADD COLUMN supervisor_provider_id TEXT')
  }

  if (!workspaceColumns.includes('supervisor_model')) {
    await db.execute(
      "ALTER TABLE app_workspaces ADD COLUMN supervisor_model TEXT NOT NULL DEFAULT ''"
    )
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_workspace_members (
      workspace_id TEXT NOT NULL,
      assistant_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, assistant_id),
      FOREIGN KEY (workspace_id) REFERENCES app_workspaces(id) ON DELETE CASCADE
    )
  `)

  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_workspaces_supervisor_provider_id ON app_workspaces(supervisor_provider_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_workspace_members_workspace_id ON app_workspace_members(workspace_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_workspace_members_assistant_id ON app_workspace_members(assistant_id)'
  )
}

async function removeLegacyResetTables(db: AppDatabase): Promise<void> {
  await db.execute('DROP TABLE IF EXISTS app_group_thread_assistant_threads')
  await db.execute('DROP TABLE IF EXISTS app_group_thread_messages')
  await db.execute('DROP TABLE IF EXISTS app_group_threads')
  await db.execute('DROP TABLE IF EXISTS app_group_workspace_members')
  await db.execute('DROP TABLE IF EXISTS app_group_workspaces')
  await db.execute('DROP TABLE IF EXISTS app_team_thread_members')
  await db.execute('DROP TABLE IF EXISTS app_team_workspace_members')
  await db.execute('DROP TABLE IF EXISTS app_team_threads')
  await db.execute('DROP TABLE IF EXISTS app_team_workspaces')
  await db.execute(
    "DELETE FROM app_preferences WHERE key IN ('built_in_default_team_workspace_id', 'built_in_browser.show_browser')"
  )
}

async function ensureChannelsTables(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_channels (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      assistant_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL DEFAULT '{}',
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assistant_id) REFERENCES app_assistants(id) ON DELETE SET NULL
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_channel_thread_bindings (
      channel_id TEXT NOT NULL,
      remote_chat_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (channel_id, remote_chat_id),
      FOREIGN KEY (channel_id) REFERENCES app_channels(id) ON DELETE CASCADE,
      FOREIGN KEY (thread_id) REFERENCES app_threads(id) ON DELETE CASCADE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_channel_pairings (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      remote_chat_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_display_name TEXT NOT NULL DEFAULT '',
      sender_username TEXT,
      code TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at TEXT,
      approved_at TEXT,
      rejected_at TEXT,
      revoked_at TEXT,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES app_channels(id) ON DELETE CASCADE
    )
  `)

  await db.execute('CREATE INDEX IF NOT EXISTS idx_app_channels_type ON app_channels(type)')
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_channels_assistant_id ON app_channels(assistant_id)'
  )
  await db.execute('CREATE INDEX IF NOT EXISTS idx_app_channels_enabled ON app_channels(enabled)')
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_channel_thread_bindings_thread_id ON app_channel_thread_bindings(thread_id)'
  )
  await db.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_app_channel_pairings_channel_sender ON app_channel_pairings(channel_id, remote_chat_id, sender_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_channel_pairings_channel_status ON app_channel_pairings(channel_id, status)'
  )
}

async function ensureThreadMetadataColumn(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_threads')")
  const hasMetadataColumn = tableInfo.rows.some((row) => {
    return String((row as Record<string, unknown>).name) === 'metadata'
  })

  if (hasMetadataColumn) {
    return
  }

  await db.execute("ALTER TABLE app_threads ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'")
}

async function ensureThreadUsageTables(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_thread_message_usage (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      assistant_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      provider_id TEXT,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      step_count INTEGER NOT NULL DEFAULT 0,
      finish_reason TEXT,
      source TEXT NOT NULL,
      raw_usage_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_thread_usage_totals (
      thread_id TEXT PRIMARY KEY,
      assistant_message_count INTEGER NOT NULL DEFAULT 0,
      input_tokens_total INTEGER NOT NULL DEFAULT 0,
      output_tokens_total INTEGER NOT NULL DEFAULT 0,
      total_tokens_total INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens_total INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens_total INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_thread_message_usage_thread_id ON app_thread_message_usage(thread_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_thread_message_usage_assistant_id ON app_thread_message_usage(assistant_id)'
  )
}

async function removeLegacyScheduledRunTables(db: AppDatabase): Promise<void> {
  await db.execute('DROP TABLE IF EXISTS app_cron_job_runs')
  await db.execute('DROP TABLE IF EXISTS app_cron_jobs')
  await db.execute('DROP TABLE IF EXISTS app_assistant_heartbeat_runs')
  await db.execute('DROP TABLE IF EXISTS app_assistant_heartbeats')
}

async function backfillAssistantEnabledFromChannels(db: AppDatabase): Promise<void> {
  await db.execute(`
    UPDATE app_assistants
    SET enabled = 1
    WHERE id IN (
      SELECT DISTINCT assistant_id
      FROM app_channels
      WHERE assistant_id IS NOT NULL
    )
  `)
}

export async function migrateAppSchema(pathOrUrl: string): Promise<AppDatabase> {
  const db = createAppDatabase(pathOrUrl)

  // Enable foreign key constraints
  await db.execute('PRAGMA foreign_keys = ON')

  let migrationSql = APP_CORE_MIGRATION_SQL
  try {
    migrationSql = await readFile(MIGRATION_FILE, 'utf8')
  } catch (error) {
    const errorCode = (error as { code?: string }).code
    if (errorCode !== 'ENOENT') {
      throw error
    }
  }
  const statements = parseStatements(migrationSql)

  for (const statement of statements) {
    try {
      await db.execute(statement)
    } catch (error) {
      if (isMissingColumnIndexError(statement, error)) {
        continue
      }

      throw error
    }
  }

  await ensureAssistantDescriptionColumn(db)
  await ensureAssistantEnabledColumn(db)
  await ensureAssistantMaxStepsColumn(db)
  await ensureProviderSupportsVisionColumn(db)
  await ensureBuiltInProviderColumns(db)
  await ensureWorkspaceTables(db)
  await removeLegacyResetTables(db)
  await ensureChannelsTables(db)
  await backfillAssistantEnabledFromChannels(db)
  await ensureThreadMetadataColumn(db)
  await ensureThreadUsageTables(db)
  await removeLegacyScheduledRunTables(db)

  return db
}
