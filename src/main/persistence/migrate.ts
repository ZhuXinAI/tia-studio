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

async function ensureTeamTables(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_team_workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_team_threads (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      title TEXT NOT NULL,
      team_description TEXT NOT NULL DEFAULT '',
      supervisor_provider_id TEXT,
      supervisor_model TEXT NOT NULL DEFAULT '',
      last_message_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES app_team_workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (supervisor_provider_id) REFERENCES app_providers(id)
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_team_thread_members (
      team_thread_id TEXT NOT NULL,
      assistant_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (team_thread_id, assistant_id),
      FOREIGN KEY (team_thread_id) REFERENCES app_team_threads(id) ON DELETE CASCADE
    )
  `)

  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_team_threads_workspace_id ON app_team_threads(workspace_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_team_threads_resource_id ON app_team_threads(resource_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_team_threads_supervisor_provider_id ON app_team_threads(supervisor_provider_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_team_thread_members_team_thread_id ON app_team_thread_members(team_thread_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_team_thread_members_assistant_id ON app_team_thread_members(assistant_id)'
  )
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
    await db.execute(statement)
  }

  await ensureAssistantMaxStepsColumn(db)
  await ensureProviderSupportsVisionColumn(db)
  await ensureBuiltInProviderColumns(db)
  await ensureTeamTables(db)

  return db
}
