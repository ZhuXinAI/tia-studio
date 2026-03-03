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

export async function migrateAppSchema(pathOrUrl: string): Promise<AppDatabase> {
  const db = createAppDatabase(pathOrUrl)
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

  return db
}
