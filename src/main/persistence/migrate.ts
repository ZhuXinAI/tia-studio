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

  return db
}
