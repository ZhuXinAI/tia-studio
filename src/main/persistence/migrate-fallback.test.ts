import { expect, it, vi } from 'vitest'

it('falls back to bundled migration SQL when migration file is missing', async () => {
  vi.resetModules()
  vi.doMock('node:fs/promises', () => ({
    readFile: vi.fn(async () => {
      const error = new Error('ENOENT: missing migration file') as Error & { code?: string }
      error.code = 'ENOENT'
      throw error
    })
  }))

  const { migrateAppSchema } = await import('./migrate')
  const db = await migrateAppSchema(':memory:')
  const result = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
  const tableNames = result.rows.map((row) => String((row as Record<string, unknown>).name))

  expect(tableNames).toContain('app_profiles')
  expect(tableNames).toContain('app_providers')
  expect(tableNames).toContain('app_assistants')
  expect(tableNames).toContain('app_threads')

  await db.close()
})
