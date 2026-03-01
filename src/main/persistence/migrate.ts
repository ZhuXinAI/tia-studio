import { readFile } from 'node:fs/promises'
import { createAppDatabase, type AppDatabase } from './client'

const MIGRATION_FILE = new URL('./migrations/0001_app_core.sql', import.meta.url)

function parseStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

export async function migrateAppSchema(pathOrUrl: string): Promise<AppDatabase> {
  const db = createAppDatabase(pathOrUrl)
  const migrationSql = await readFile(MIGRATION_FILE, 'utf8')
  const statements = parseStatements(migrationSql)

  for (const statement of statements) {
    await db.execute(statement)
  }

  return db
}
