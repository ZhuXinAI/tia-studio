import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateAppSchema } from './migrate'
import { removeTestDirectory } from '../../test/remove-test-directory'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(removeTestDirectory))
})

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tia-v3-migrate-'))
  directories.push(directory)
  return join(directory, 'app.db')
}

describe('v3 Pi migration', () => {
  it('creates only the v3 conversation ownership tables on a fresh install', async () => {
    const db = await migrateAppSchema(await databasePath())
    const tables = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    const names = tables.rows.map((row) => String((row as Record<string, unknown>).name))
    expect(names).toContain('app_agent_sessions')
    expect(names).toContain('app_channel_session_bindings')
    expect(names).not.toContain('app_assistants')
    expect(names).not.toContain('app_threads')
    const channelColumns = await db.execute("PRAGMA table_info('app_channels')")
    expect(
      channelColumns.rows.map((row) => String((row as Record<string, unknown>).name))
    ).toContain('workspace_id')
    await db.close()
  })

  it('destructively clears history and removes legacy ownership on upgrade', async () => {
    const path = await databasePath()
    const db = await migrateAppSchema(path)
    await db.execute("DELETE FROM app_preferences WHERE key = 'schema.pi_harness_v3'")
    await db.execute(
      "INSERT INTO app_providers (id, name, type, api_key, selected_model) VALUES ('p', 'P', 'openai', 'secret', 'gpt-4o')"
    )
    await db.execute("INSERT INTO app_workspaces (id, name, root_path) VALUES ('w', 'W', '/tmp/w')")
    await db.execute(
      "INSERT INTO app_agent_sessions (id, workspace_id, workspace_path, title, provider_id, provider, model_id) VALUES ('s', 'w', '/tmp/w', 'Old', 'p', 'openai', 'gpt-4o')"
    )
    await db.execute(
      "INSERT INTO app_agent_messages (id, session_id, role, status, created_at) VALUES ('m', 's', 'user', 'complete', CURRENT_TIMESTAMP)"
    )
    await db.execute('ALTER TABLE app_channels ADD COLUMN assistant_id TEXT')
    await db.execute('CREATE TABLE app_assistants (id TEXT PRIMARY KEY)')
    await db.execute('CREATE TABLE app_threads (id TEXT PRIMARY KEY)')
    await db.close()

    const migrated = await migrateAppSchema(path)
    const sessions = await migrated.execute('SELECT COUNT(*) AS count FROM app_agent_sessions')
    expect(Number((sessions.rows[0] as Record<string, unknown>).count)).toBe(0)
    const tables = await migrated.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    const names = tables.rows.map((row) => String((row as Record<string, unknown>).name))
    expect(names).not.toContain('app_assistants')
    expect(names).not.toContain('app_threads')
    const columns = await migrated.execute("PRAGMA table_info('app_channels')")
    expect(columns.rows.map((row) => String((row as Record<string, unknown>).name))).not.toContain(
      'assistant_id'
    )
    await migrated.close()
  })

  it('backfills schedule provenance for the latest existing run', async () => {
    const path = await databasePath()
    const db = await migrateAppSchema(path)
    await db.execute(
      "INSERT INTO app_providers (id, name, type, api_key, selected_model) VALUES ('p', 'P', 'openai', 'secret', 'gpt-4o')"
    )
    await db.execute("INSERT INTO app_workspaces (id, name, root_path) VALUES ('w', 'W', '/tmp/w')")
    await db.execute(
      "INSERT INTO app_agent_sessions (id, workspace_id, workspace_path, title, provider_id, provider, model_id) VALUES ('s', 'w', '/tmp/w', 'Scheduled run', 'p', 'openai', 'gpt-4o')"
    )
    await db.execute(
      "INSERT INTO app_agent_sessions (id, workspace_id, workspace_path, title, provider_id, provider, model_id) VALUES ('historical', 'w', '/tmp/w', 'Schedule', 'p', 'openai', 'gpt-4o')"
    )
    await db.execute(
      "INSERT INTO app_automations (id, name, prompt, rrule, workspace_id, provider_id, model_id, last_session_id) VALUES ('a', 'Schedule', 'Run', 'FREQ=DAILY', 'w', 'p', 'gpt-4o', 's')"
    )
    await db.close()

    const migrated = await migrateAppSchema(path)
    const sessions = await migrated.execute(
      'SELECT id, automation_id FROM app_agent_sessions ORDER BY id'
    )
    expect(sessions.rows).toMatchObject([
      { id: 'historical', automation_id: 'a' },
      { id: 's', automation_id: 'a' }
    ])
    await migrated.close()
  })
})
