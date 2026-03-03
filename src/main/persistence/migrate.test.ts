import { expect, it } from 'vitest'
import { migrateAppSchema } from './migrate'

it('creates core app tables', async () => {
  const db = await migrateAppSchema(':memory:')
  const result = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
  const tableNames = result.rows.map((row) => String((row as Record<string, unknown>).name))
  const assistantColumnsResult = await db.execute("PRAGMA table_info('app_assistants')")
  const assistantColumns = assistantColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )

  expect(tableNames).toContain('app_profiles')
  expect(tableNames).toContain('app_providers')
  expect(tableNames).toContain('app_assistants')
  expect(tableNames).toContain('app_threads')
  expect(tableNames).toContain('app_preferences')
  expect(assistantColumns).toContain('max_steps')

  await db.close()
})
