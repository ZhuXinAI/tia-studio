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

function isMissingColumnIndexError(statement: string, error: unknown): boolean {
  if (!statement.startsWith('CREATE INDEX IF NOT EXISTS')) {
    return false
  }

  return error instanceof Error && /no such column/i.test(error.message)
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

async function ensureAssistantDescriptionColumn(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_assistants')")
  const hasDescriptionColumn = tableInfo.rows.some((row) => {
    return String((row as Record<string, unknown>).name) === 'description'
  })

  if (hasDescriptionColumn) {
    return
  }

  await db.execute("ALTER TABLE app_assistants ADD COLUMN description TEXT NOT NULL DEFAULT ''")
}

async function ensureAssistantEnabledColumn(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_assistants')")
  const hasEnabledColumn = tableInfo.rows.some((row) => {
    return String((row as Record<string, unknown>).name) === 'enabled'
  })

  if (hasEnabledColumn) {
    return
  }

  await db.execute('ALTER TABLE app_assistants ADD COLUMN enabled INTEGER NOT NULL DEFAULT 0')
}

async function ensureAssistantOriginColumn(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_assistants')")
  const hasOriginColumn = tableInfo.rows.some((row) => {
    return String((row as Record<string, unknown>).name) === 'origin'
  })

  if (hasOriginColumn) {
    return
  }

  await db.execute("ALTER TABLE app_assistants ADD COLUMN origin TEXT NOT NULL DEFAULT 'tia'")
}

async function ensureAssistantStudioFeaturesColumn(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_assistants')")
  const hasStudioFeaturesColumn = tableInfo.rows.some((row) => {
    return String((row as Record<string, unknown>).name) === 'studio_features_enabled'
  })

  if (hasStudioFeaturesColumn) {
    return
  }

  await db.execute(
    'ALTER TABLE app_assistants ADD COLUMN studio_features_enabled INTEGER NOT NULL DEFAULT 1'
  )
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
      team_description TEXT NOT NULL DEFAULT '',
      supervisor_provider_id TEXT,
      supervisor_model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supervisor_provider_id) REFERENCES app_providers(id)
    )
  `)

  const teamWorkspaceTableInfo = await db.execute("PRAGMA table_info('app_team_workspaces')")
  const teamWorkspaceColumns = teamWorkspaceTableInfo.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )

  if (!teamWorkspaceColumns.includes('team_description')) {
    await db.execute(
      "ALTER TABLE app_team_workspaces ADD COLUMN team_description TEXT NOT NULL DEFAULT ''"
    )
  }

  if (!teamWorkspaceColumns.includes('supervisor_provider_id')) {
    await db.execute('ALTER TABLE app_team_workspaces ADD COLUMN supervisor_provider_id TEXT')
  }

  if (!teamWorkspaceColumns.includes('supervisor_model')) {
    await db.execute(
      "ALTER TABLE app_team_workspaces ADD COLUMN supervisor_model TEXT NOT NULL DEFAULT ''"
    )
  }

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
    CREATE TABLE IF NOT EXISTS app_team_workspace_members (
      workspace_id TEXT NOT NULL,
      assistant_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, assistant_id),
      FOREIGN KEY (workspace_id) REFERENCES app_team_workspaces(id) ON DELETE CASCADE
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
    'CREATE INDEX IF NOT EXISTS idx_app_team_workspaces_supervisor_provider_id ON app_team_workspaces(supervisor_provider_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_team_workspace_members_workspace_id ON app_team_workspace_members(workspace_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_team_workspace_members_assistant_id ON app_team_workspace_members(assistant_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_team_thread_members_team_thread_id ON app_team_thread_members(team_thread_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_team_thread_members_assistant_id ON app_team_thread_members(assistant_id)'
  )

  const workspaceConfigs = await db.execute(`
    SELECT
      id,
      COALESCE(team_description, '') AS team_description,
      supervisor_provider_id,
      COALESCE(supervisor_model, '') AS supervisor_model
    FROM app_team_workspaces
  `)

  for (const row of workspaceConfigs.rows) {
    const workspace = row as Record<string, unknown>
    const workspaceId = String(workspace.id)
    const hasWorkspaceConfig =
      String(workspace.team_description).trim().length > 0 ||
      (workspace.supervisor_provider_id !== null &&
        workspace.supervisor_provider_id !== undefined) ||
      String(workspace.supervisor_model).trim().length > 0

    const workspaceMembers = await db.execute(
      'SELECT assistant_id FROM app_team_workspace_members WHERE workspace_id = ? LIMIT 1',
      [workspaceId]
    )
    const hasWorkspaceMembers = workspaceMembers.rows.length > 0

    if (hasWorkspaceConfig && hasWorkspaceMembers) {
      continue
    }

    const legacyThreadResult = await db.execute(
      `
        SELECT id, team_description, supervisor_provider_id, supervisor_model
        FROM app_team_threads
        WHERE workspace_id = ?
          AND (
            TRIM(COALESCE(team_description, '')) != ''
            OR supervisor_provider_id IS NOT NULL
            OR TRIM(COALESCE(supervisor_model, '')) != ''
          )
        ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC
        LIMIT 1
      `,
      [workspaceId]
    )
    const legacyThread = legacyThreadResult.rows.at(0) as Record<string, unknown> | undefined

    if (legacyThread && !hasWorkspaceConfig) {
      await db.execute(
        `
          UPDATE app_team_workspaces
          SET team_description = ?, supervisor_provider_id = ?, supervisor_model = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          String(legacyThread.team_description ?? ''),
          legacyThread.supervisor_provider_id ? String(legacyThread.supervisor_provider_id) : null,
          String(legacyThread.supervisor_model ?? ''),
          workspaceId
        ]
      )
    }

    if (!legacyThread || hasWorkspaceMembers) {
      continue
    }

    const legacyMembersResult = await db.execute(
      `
        SELECT assistant_id, sort_order
        FROM app_team_thread_members
        WHERE team_thread_id = ?
        ORDER BY sort_order ASC, created_at ASC
      `,
      [String(legacyThread.id)]
    )

    for (const memberRow of legacyMembersResult.rows) {
      const member = memberRow as Record<string, unknown>
      await db.execute(
        `
          INSERT OR IGNORE INTO app_team_workspace_members (workspace_id, assistant_id, sort_order)
          VALUES (?, ?, ?)
        `,
        [workspaceId, String(member.assistant_id), Number(member.sort_order)]
      )
    }
  }
}

async function removeLegacyGroupTables(db: AppDatabase): Promise<void> {
  await db.execute('DROP TABLE IF EXISTS app_group_thread_assistant_threads')
  await db.execute('DROP TABLE IF EXISTS app_group_thread_messages')
  await db.execute('DROP TABLE IF EXISTS app_group_threads')
  await db.execute('DROP TABLE IF EXISTS app_group_workspace_members')
  await db.execute('DROP TABLE IF EXISTS app_group_workspaces')
}

async function ensureChannelsTables(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_channels (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      assistant_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL DEFAULT '{}',
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assistant_id) REFERENCES app_assistants(id) ON DELETE SET NULL
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_channel_thread_bindings (
      channel_id TEXT NOT NULL,
      remote_chat_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (channel_id, remote_chat_id),
      FOREIGN KEY (channel_id) REFERENCES app_channels(id) ON DELETE CASCADE,
      FOREIGN KEY (thread_id) REFERENCES app_threads(id) ON DELETE CASCADE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_channel_pairings (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      remote_chat_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_display_name TEXT NOT NULL DEFAULT '',
      sender_username TEXT,
      code TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at TEXT,
      approved_at TEXT,
      rejected_at TEXT,
      revoked_at TEXT,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES app_channels(id) ON DELETE CASCADE
    )
  `)

  await db.execute('CREATE INDEX IF NOT EXISTS idx_app_channels_type ON app_channels(type)')
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_channels_assistant_id ON app_channels(assistant_id)'
  )
  await db.execute('CREATE INDEX IF NOT EXISTS idx_app_channels_enabled ON app_channels(enabled)')
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_channel_thread_bindings_thread_id ON app_channel_thread_bindings(thread_id)'
  )
  await db.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_app_channel_pairings_channel_sender ON app_channel_pairings(channel_id, remote_chat_id, sender_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_channel_pairings_channel_status ON app_channel_pairings(channel_id, status)'
  )
}

async function ensureThreadMetadataColumn(db: AppDatabase): Promise<void> {
  const tableInfo = await db.execute("PRAGMA table_info('app_threads')")
  const hasMetadataColumn = tableInfo.rows.some((row) => {
    return String((row as Record<string, unknown>).name) === 'metadata'
  })

  if (hasMetadataColumn) {
    return
  }

  await db.execute("ALTER TABLE app_threads ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'")
}

async function ensureThreadUsageTables(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_thread_message_usage (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      assistant_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      provider_id TEXT,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      step_count INTEGER NOT NULL DEFAULT 0,
      finish_reason TEXT,
      source TEXT NOT NULL,
      raw_usage_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_thread_usage_totals (
      thread_id TEXT PRIMARY KEY,
      assistant_message_count INTEGER NOT NULL DEFAULT 0,
      input_tokens_total INTEGER NOT NULL DEFAULT 0,
      output_tokens_total INTEGER NOT NULL DEFAULT 0,
      total_tokens_total INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens_total INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens_total INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_thread_message_usage_thread_id ON app_thread_message_usage(thread_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_thread_message_usage_assistant_id ON app_thread_message_usage(assistant_id)'
  )
}

async function ensureCronTables(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_cron_jobs (
      id TEXT PRIMARY KEY,
      assistant_id TEXT NOT NULL,
      thread_id TEXT,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      last_run_status TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assistant_id) REFERENCES app_assistants(id) ON DELETE CASCADE,
      FOREIGN KEY (thread_id) REFERENCES app_threads(id) ON DELETE SET NULL
    )
  `)

  const cronJobsTableInfo = await db.execute("PRAGMA table_info('app_cron_jobs')")
  const cronJobsColumns = cronJobsTableInfo.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )

  if (!cronJobsColumns.includes('thread_id')) {
    await db.execute(
      'ALTER TABLE app_cron_jobs ADD COLUMN thread_id TEXT REFERENCES app_threads(id) ON DELETE SET NULL'
    )
  }

  if (!cronJobsColumns.includes('last_run_at')) {
    await db.execute('ALTER TABLE app_cron_jobs ADD COLUMN last_run_at TEXT')
  }

  if (!cronJobsColumns.includes('next_run_at')) {
    await db.execute('ALTER TABLE app_cron_jobs ADD COLUMN next_run_at TEXT')
  }

  if (!cronJobsColumns.includes('last_run_status')) {
    await db.execute('ALTER TABLE app_cron_jobs ADD COLUMN last_run_status TEXT')
  }

  if (!cronJobsColumns.includes('last_error')) {
    await db.execute('ALTER TABLE app_cron_jobs ADD COLUMN last_error TEXT')
  }

  if (!cronJobsColumns.includes('channel_id')) {
    await db.execute('ALTER TABLE app_cron_jobs ADD COLUMN channel_id TEXT')
  }

  if (!cronJobsColumns.includes('remote_chat_id')) {
    await db.execute('ALTER TABLE app_cron_jobs ADD COLUMN remote_chat_id TEXT')
  }

  if (!cronJobsColumns.includes('recurring')) {
    await db.execute('ALTER TABLE app_cron_jobs ADD COLUMN recurring INTEGER NOT NULL DEFAULT 1')
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_cron_job_runs (
      id TEXT PRIMARY KEY,
      cron_job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      output_text TEXT,
      error TEXT,
      work_log_path TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cron_job_id) REFERENCES app_cron_jobs(id) ON DELETE CASCADE
    )
  `)

  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_cron_jobs_assistant_id ON app_cron_jobs(assistant_id)'
  )
  await db.execute('CREATE INDEX IF NOT EXISTS idx_app_cron_jobs_enabled ON app_cron_jobs(enabled)')
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_cron_jobs_next_run_at ON app_cron_jobs(next_run_at)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_cron_job_runs_cron_job_id ON app_cron_job_runs(cron_job_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_cron_job_runs_scheduled_for ON app_cron_job_runs(scheduled_for)'
  )
}

async function ensureAssistantHeartbeatTables(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_assistant_heartbeats (
      id TEXT PRIMARY KEY,
      assistant_id TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 0,
      interval_minutes INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      thread_id TEXT,
      last_run_at TEXT,
      next_run_at TEXT,
      last_run_status TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assistant_id) REFERENCES app_assistants(id) ON DELETE CASCADE,
      FOREIGN KEY (thread_id) REFERENCES app_threads(id) ON DELETE SET NULL
    )
  `)

  const heartbeatsTableInfo = await db.execute("PRAGMA table_info('app_assistant_heartbeats')")
  const heartbeatColumns = heartbeatsTableInfo.rows.map((row) =>
    String((row as Record<string, unknown>).name)
  )

  if (!heartbeatColumns.includes('thread_id')) {
    await db.execute(
      'ALTER TABLE app_assistant_heartbeats ADD COLUMN thread_id TEXT REFERENCES app_threads(id) ON DELETE SET NULL'
    )
  }

  if (!heartbeatColumns.includes('last_run_at')) {
    await db.execute('ALTER TABLE app_assistant_heartbeats ADD COLUMN last_run_at TEXT')
  }

  if (!heartbeatColumns.includes('next_run_at')) {
    await db.execute('ALTER TABLE app_assistant_heartbeats ADD COLUMN next_run_at TEXT')
  }

  if (!heartbeatColumns.includes('last_run_status')) {
    await db.execute('ALTER TABLE app_assistant_heartbeats ADD COLUMN last_run_status TEXT')
  }

  if (!heartbeatColumns.includes('last_error')) {
    await db.execute('ALTER TABLE app_assistant_heartbeats ADD COLUMN last_error TEXT')
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_assistant_heartbeat_runs (
      id TEXT PRIMARY KEY,
      heartbeat_id TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      output_text TEXT,
      error TEXT,
      work_log_path TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (heartbeat_id) REFERENCES app_assistant_heartbeats(id) ON DELETE CASCADE
    )
  `)

  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_assistant_heartbeats_assistant_id ON app_assistant_heartbeats(assistant_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_assistant_heartbeats_enabled ON app_assistant_heartbeats(enabled)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_assistant_heartbeats_next_run_at ON app_assistant_heartbeats(next_run_at)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_assistant_heartbeat_runs_heartbeat_id ON app_assistant_heartbeat_runs(heartbeat_id)'
  )
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_assistant_heartbeat_runs_scheduled_for ON app_assistant_heartbeat_runs(scheduled_for)'
  )
}

async function backfillAssistantEnabledFromChannels(db: AppDatabase): Promise<void> {
  await db.execute(`
    UPDATE app_assistants
    SET enabled = 1
    WHERE id IN (
      SELECT DISTINCT assistant_id
      FROM app_channels
      WHERE assistant_id IS NOT NULL
    )
  `)
}

async function normalizeAssistantOrigins(db: AppDatabase): Promise<void> {
  await db.execute(`
    UPDATE app_assistants
    SET origin = CASE
      WHEN json_extract(mcp_config, '$.__tiaBuiltInDefaultAgent') = 1 THEN 'built-in'
      WHEN origin IS NULL OR TRIM(origin) = '' THEN 'tia'
      WHEN origin NOT IN ('tia', 'external-acp', 'built-in') THEN 'tia'
      ELSE origin
    END
    WHERE origin IS NULL
      OR TRIM(origin) = ''
      OR origin NOT IN ('tia', 'external-acp', 'built-in')
      OR json_extract(mcp_config, '$.__tiaBuiltInDefaultAgent') = 1
  `)
}

async function normalizeAssistantStudioFeatures(db: AppDatabase): Promise<void> {
  await db.execute(`
    UPDATE app_assistants
    SET studio_features_enabled = 1
    WHERE studio_features_enabled IS NULL
  `)
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
    try {
      await db.execute(statement)
    } catch (error) {
      if (isMissingColumnIndexError(statement, error)) {
        continue
      }

      throw error
    }
  }

  await ensureAssistantDescriptionColumn(db)
  await ensureAssistantEnabledColumn(db)
  await ensureAssistantMaxStepsColumn(db)
  await ensureAssistantOriginColumn(db)
  await ensureAssistantStudioFeaturesColumn(db)
  await ensureProviderSupportsVisionColumn(db)
  await ensureBuiltInProviderColumns(db)
  await ensureTeamTables(db)
  await removeLegacyGroupTables(db)
  await ensureChannelsTables(db)
  await backfillAssistantEnabledFromChannels(db)
  await normalizeAssistantOrigins(db)
  await normalizeAssistantStudioFeatures(db)
  await ensureThreadMetadataColumn(db)
  await ensureThreadUsageTables(db)
  await ensureCronTables(db)
  await ensureAssistantHeartbeatTables(db)

  return db
}
