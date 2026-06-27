import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { createAppDatabase } from './client'
import { migrateAppSchema } from './migrate'

const tempPaths: string[] = []

afterEach(() => {
  tempPaths.splice(0).forEach((tempPath) => {
    void rm(tempPath, {
      recursive: true,
      force: true,
      maxRetries: 50,
      retryDelay: 200
    }).catch(() => undefined)
  })
})

it('creates core app tables', async () => {
  const db = await migrateAppSchema(':memory:')
  const result = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
  const tableNames = result.rows.map((row) => String((row as Record<string, unknown>).name))
  const assistantColumnsResult = await db.execute("PRAGMA table_info('app_assistants')")
  const assistantColumns = assistantColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const providerColumnsResult = await db.execute("PRAGMA table_info('app_providers')")
  const providerColumns = providerColumnsResult.rows.map((row) =>
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
  const workspaceColumnsResult = await db.execute("PRAGMA table_info('app_workspaces')")
  const workspaceColumns = workspaceColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  expect(tableNames).toContain('app_profiles')
  expect(tableNames).toContain('app_providers')
  expect(tableNames).toContain('app_assistants')
  expect(tableNames).toContain('app_threads')
  expect(tableNames).toContain('app_channels')
  expect(tableNames).toContain('app_channel_thread_bindings')
  expect(tableNames).toContain('app_channel_pairings')
  expect(tableNames).toContain('app_workspaces')
  expect(tableNames).toContain('app_workspace_members')
  expect(tableNames).toContain('app_thread_message_usage')
  expect(tableNames).toContain('app_thread_usage_totals')
  expect(tableNames).toContain('app_preferences')
  expect(tableNames).not.toContain('app_group_workspaces')
  expect(tableNames).not.toContain('app_group_workspace_members')
  expect(tableNames).not.toContain('app_group_threads')
  expect(tableNames).not.toContain('app_group_thread_messages')
  expect(tableNames).not.toContain('app_group_thread_assistant_threads')
  expect(tableNames).not.toContain('app_team_workspaces')
  expect(tableNames).not.toContain('app_team_workspace_members')
  expect(tableNames).not.toContain('app_team_threads')
  expect(tableNames).not.toContain('app_team_thread_members')
  expect(assistantColumns).toContain('description')
  expect(assistantColumns).toContain('enabled')
  expect(assistantColumns).toContain('max_steps')
  expect(providerColumns).toContain('selected_model_context_window_tokens')
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
  expect(workspaceColumns).toContain('description')
  expect(workspaceColumns).toContain('supervisor_provider_id')
  expect(workspaceColumns).toContain('supervisor_model')

  await db.close()
})

it('backfills known provider context windows for legacy providers', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-provider-context-migrate-'))
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
  await legacyDb.execute(
    'INSERT INTO app_providers (id, name, type, api_key, api_host, selected_model, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['provider-openai', 'OpenAI', 'openai', 'test-key', 'https://api.openai.com/v1', 'gpt-5', 1]
  )
  await legacyDb.close()

  const migratedDb = await migrateAppSchema(dbPath)
  const providerColumnsResult = await migratedDb.execute("PRAGMA table_info('app_providers')")
  const providerColumns = providerColumnsResult.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )
  const providerResult = await migratedDb.execute(
    'SELECT selected_model_context_window_tokens FROM app_providers WHERE id = ?',
    ['provider-openai']
  )

  expect(providerColumns).toContain('selected_model_context_window_tokens')
  expect(providerResult.rows).toEqual([
    {
      selected_model_context_window_tokens: 400000
    }
  ])

  await migratedDb.close()
})

it('removes legacy group tables during migration', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-group-migrate-'))
  tempPaths.push(tempDir)
  const dbPath = path.join(tempDir, 'app.db')
  const legacyDb = createAppDatabase(dbPath)

  await legacyDb.execute('PRAGMA foreign_keys = ON')
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_group_workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    )
  `)
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_group_workspace_members (
      workspace_id TEXT NOT NULL,
      assistant_id TEXT NOT NULL,
      PRIMARY KEY (workspace_id, assistant_id)
    )
  `)
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_group_threads (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL
    )
  `)
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_group_thread_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL
    )
  `)
  await legacyDb.execute(`
    CREATE TABLE IF NOT EXISTS app_group_thread_assistant_threads (
      group_thread_id TEXT NOT NULL,
      assistant_id TEXT NOT NULL,
      assistant_thread_id TEXT NOT NULL,
      PRIMARY KEY (group_thread_id, assistant_id)
    )
  `)
  await legacyDb.close()

  const db = await migrateAppSchema(dbPath)
  const result = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
  const tableNames = result.rows.map((row) => String((row as Record<string, unknown>).name))

  expect(tableNames).not.toContain('app_group_workspaces')
  expect(tableNames).not.toContain('app_group_workspace_members')
  expect(tableNames).not.toContain('app_group_threads')
  expect(tableNames).not.toContain('app_group_thread_messages')
  expect(tableNames).not.toContain('app_group_thread_assistant_threads')

  await db.close()
})

it('removes legacy team-owned workspace tables during reset migration', async () => {
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
  const result = await migratedDb.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
  const tableNames = result.rows.map((row) => String((row as Record<string, unknown>).name))
  const preferenceRows = await migratedDb.execute(
    "SELECT key FROM app_preferences WHERE key = 'built_in_default_team_workspace_id'"
  )

  expect(tableNames).not.toContain('app_team_workspaces')
  expect(tableNames).not.toContain('app_team_workspace_members')
  expect(tableNames).not.toContain('app_team_threads')
  expect(tableNames).not.toContain('app_team_thread_members')
  expect(tableNames).toContain('app_workspaces')
  expect(tableNames).toContain('app_workspace_members')
  expect(preferenceRows.rows).toEqual([])

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
