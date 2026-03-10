import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, expect, it } from 'vitest'
import { createAppDatabase } from './client'
import { migrateAppSchema } from './migrate'

const tempPaths: string[] = []

afterEach(async () => {
  for (const tempPath of tempPaths.splice(0)) {
    await delay(250)
    await rm(tempPath, {
      recursive: true,
      force: true,
      maxRetries: 50,
      retryDelay: 200
    })
  }
}, 60_000)

it('creates core app tables', async () => {
  const db = await migrateAppSchema(':memory:')
  const result = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
  const tableNames = result.rows.map((row) => String((row as Record<string, unknown>).name))
  const assistantColumnsResult = await db.execute("PRAGMA table_info('app_assistants')")
  const assistantColumns = assistantColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const channelColumnsResult = await db.execute("PRAGMA table_info('app_channels')")
  const channelColumns = channelColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const channelThreadBindingColumnsResult = await db.execute(
    "PRAGMA table_info('app_channel_thread_bindings')"
  )
  const channelThreadBindingColumns = channelThreadBindingColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const channelPairingColumnsResult = await db.execute("PRAGMA table_info('app_channel_pairings')")
  const channelPairingColumns = channelPairingColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const teamWorkspaceColumnsResult = await db.execute("PRAGMA table_info('app_team_workspaces')")
  const teamWorkspaceColumns = teamWorkspaceColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const assistantHeartbeatColumnsResult = await db.execute(
    "PRAGMA table_info('app_assistant_heartbeats')"
  )
  const assistantHeartbeatColumns = assistantHeartbeatColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const assistantHeartbeatRunColumnsResult = await db.execute(
    "PRAGMA table_info('app_assistant_heartbeat_runs')"
  )
  const assistantHeartbeatRunColumns = assistantHeartbeatRunColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )

  expect(tableNames).toContain('app_profiles')
  expect(tableNames).toContain('app_providers')
  expect(tableNames).toContain('app_assistants')
  expect(tableNames).toContain('app_threads')
  expect(tableNames).toContain('app_channels')
  expect(tableNames).toContain('app_channel_thread_bindings')
  expect(tableNames).toContain('app_channel_pairings')
  expect(tableNames).toContain('app_assistant_heartbeats')
  expect(tableNames).toContain('app_assistant_heartbeat_runs')
  expect(tableNames).toContain('app_team_workspaces')
  expect(tableNames).toContain('app_team_workspace_members')
  expect(tableNames).toContain('app_preferences')
  expect(assistantColumns).toContain('description')
  expect(assistantColumns).toContain('enabled')
  expect(assistantColumns).toContain('max_steps')
  expect(channelColumns).toContain('assistant_id')
  expect(channelColumns).toContain('config')
  expect(channelColumns).toContain('last_error')
  expect(channelThreadBindingColumns).toContain('remote_chat_id')
  expect(channelThreadBindingColumns).toContain('thread_id')
  expect(channelPairingColumns).toContain('remote_chat_id')
  expect(channelPairingColumns).toContain('sender_id')
  expect(channelPairingColumns).toContain('code')
  expect(channelPairingColumns).toContain('status')
  expect(channelPairingColumns).toContain('expires_at')
  expect(assistantHeartbeatColumns).toContain('assistant_id')
  expect(assistantHeartbeatColumns).toContain('enabled')
  expect(assistantHeartbeatColumns).toContain('interval_minutes')
  expect(assistantHeartbeatColumns).toContain('prompt')
  expect(assistantHeartbeatColumns).toContain('thread_id')
  expect(assistantHeartbeatColumns).toContain('last_run_at')
  expect(assistantHeartbeatColumns).toContain('next_run_at')
  expect(assistantHeartbeatColumns).toContain('last_run_status')
  expect(assistantHeartbeatColumns).toContain('last_error')
  expect(assistantHeartbeatRunColumns).toContain('heartbeat_id')
  expect(assistantHeartbeatRunColumns).toContain('status')
  expect(assistantHeartbeatRunColumns).toContain('scheduled_for')
  expect(assistantHeartbeatRunColumns).toContain('started_at')
  expect(assistantHeartbeatRunColumns).toContain('finished_at')
  expect(assistantHeartbeatRunColumns).toContain('output_text')
  expect(assistantHeartbeatRunColumns).toContain('error')
  expect(assistantHeartbeatRunColumns).toContain('work_log_path')
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
  await legacyDb.execute('INSERT INTO app_team_workspaces (id, name, root_path) VALUES (?, ?, ?)', [
    'workspace-1',
    'Docs Workspace',
    '/Users/demo/project'
  ])
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
}, 15_000)

it('backfills assistant activation from legacy channel bindings', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-assistant-enabled-migrate-'))
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
      CREATE TABLE IF NOT EXISTS app_channels (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        assistant_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT NOT NULL DEFAULT '{}',
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

  await legacyDb.execute(
    'INSERT INTO app_assistants (id, name, instructions, provider_id) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
    [
      'assistant-bound',
      'Bound Assistant',
      '',
      null,
      'assistant-unbound',
      'Unbound Assistant',
      '',
      null
    ]
  )
  await legacyDb.execute(
    'INSERT INTO app_channels (id, type, name, assistant_id, config) VALUES (?, ?, ?, ?, ?)',
    ['channel-1', 'lark', 'Bound Lark', 'assistant-bound', '{"appId":"cli_1","appSecret":"secret"}']
  )

  await legacyDb.close()

  const migratedDb = await migrateAppSchema(dbPath)
  const assistantColumnsResult = await migratedDb.execute("PRAGMA table_info('app_assistants')")
  const assistantColumns = assistantColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const assistantsResult = await migratedDb.execute(
    'SELECT id, enabled FROM app_assistants ORDER BY id ASC'
  )

  expect(assistantColumns).toContain('enabled')
  expect(assistantsResult.rows).toEqual([
    {
      id: 'assistant-bound',
      enabled: 1
    },
    {
      id: 'assistant-unbound',
      enabled: 0
    }
  ])

  await migratedDb.close()
}, 20_000)
