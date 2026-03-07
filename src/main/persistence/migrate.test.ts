import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { createAppDatabase } from './client'
import { migrateAppSchema } from './migrate'

const tempPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map(async (tempPath) => {
      await rm(tempPath, { recursive: true, force: true })
    })
  )
})

it('creates core app tables', async () => {
  const db = await migrateAppSchema(':memory:')
  const result = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
  const tableNames = result.rows.map((row) => String((row as Record<string, unknown>).name))
  const assistantColumnsResult = await db.execute("PRAGMA table_info('app_assistants')")
  const assistantColumns = assistantColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const teamWorkspaceColumnsResult = await db.execute("PRAGMA table_info('app_team_workspaces')")
  const teamWorkspaceColumns = teamWorkspaceColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )

  expect(tableNames).toContain('app_profiles')
  expect(tableNames).toContain('app_providers')
  expect(tableNames).toContain('app_assistants')
  expect(tableNames).toContain('app_threads')
  expect(tableNames).toContain('app_team_workspaces')
  expect(tableNames).toContain('app_team_workspace_members')
  expect(tableNames).toContain('app_preferences')
  expect(assistantColumns).toContain('description')
  expect(assistantColumns).toContain('max_steps')
  expect(teamWorkspaceColumns).toContain('team_description')
  expect(teamWorkspaceColumns).toContain('supervisor_provider_id')
  expect(teamWorkspaceColumns).toContain('supervisor_model')

  await db.close()
})

it('backfills workspace-owned team config from legacy thread-owned records', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-team-migrate-'))
  tempPaths.push(tempDir)
  const dbPath = path.join(tempDir, 'app.db')
  const legacyDb = createAppDatabase(dbPath)

  await legacyDb.execute('PRAGMA foreign_keys = ON')
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      api_key TEXT NOT NULL,
      api_host TEXT,
      selected_model TEXT NOT NULL,
      provider_models TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_assistants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      provider_id TEXT,
      workspace_config TEXT NOT NULL DEFAULT '{}',
      skills_config TEXT NOT NULL DEFAULT '{}',
      mcp_config TEXT NOT NULL DEFAULT '{}',
      max_steps INTEGER NOT NULL DEFAULT 100,
      memory_config TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_threads (
      id TEXT PRIMARY KEY,
      assistant_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      title TEXT NOT NULL,
      last_message_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_team_workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await legacyDb.execute(`
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
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_team_thread_members (
      team_thread_id TEXT NOT NULL,
      assistant_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (team_thread_id, assistant_id)
    )
  `)
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await legacyDb.execute(
    'INSERT INTO app_providers (id, name, type, api_key, selected_model) VALUES (?, ?, ?, ?, ?)',
    ['provider-1', 'OpenAI', 'openai', 'secret', 'gpt-5']
  )
  await legacyDb.execute(
    'INSERT INTO app_team_workspaces (id, name, root_path) VALUES (?, ?, ?)',
    ['workspace-1', 'Docs Workspace', '/Users/demo/project']
  )
  await legacyDb.execute(
    'INSERT INTO app_team_threads (id, workspace_id, resource_id, title, team_description, supervisor_provider_id, supervisor_model, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      'thread-1',
      'workspace-1',
      'default-profile',
      'Legacy Team Thread',
      'Coordinate docs release',
      'provider-1',
      'gpt-5',
      '2026-03-07 10:00:00'
    ]
  )
  await legacyDb.execute(
    'INSERT INTO app_team_thread_members (team_thread_id, assistant_id, sort_order) VALUES (?, ?, ?), (?, ?, ?)',
    ['thread-1', 'assistant-2', 0, 'thread-1', 'assistant-1', 1]
  )

  await legacyDb.close()

  const migratedDb = await migrateAppSchema(dbPath)
  const assistantColumnsResult = await migratedDb.execute("PRAGMA table_info('app_assistants')")
  const assistantColumns = assistantColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const workspaceResult = await migratedDb.execute(
    'SELECT team_description, supervisor_provider_id, supervisor_model FROM app_team_workspaces WHERE id = ?',
    ['workspace-1']
  )
  const workspaceRow = workspaceResult.rows.at(0) as Record<string, unknown> | undefined
  const workspaceMembersResult = await migratedDb.execute(
    'SELECT workspace_id, assistant_id, sort_order FROM app_team_workspace_members WHERE workspace_id = ? ORDER BY sort_order ASC',
    ['workspace-1']
  )

  expect(workspaceRow).toMatchObject({
    team_description: 'Coordinate docs release',
    supervisor_provider_id: 'provider-1',
    supervisor_model: 'gpt-5'
  })
  expect(workspaceMembersResult.rows).toEqual([
    {
      workspace_id: 'workspace-1',
      assistant_id: 'assistant-2',
      sort_order: 0
    },
    {
      workspace_id: 'workspace-1',
      assistant_id: 'assistant-1',
      sort_order: 1
    }
  ])
  expect(assistantColumns).toContain('description')

  await migratedDb.close()
})
