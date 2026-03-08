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

  await db.execute('CREATE INDEX IF NOT EXISTS idx_app_channels_type ON app_channels(type)')
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_channels_assistant_id ON app_channels(assistant_id)'
  )
  await db.execute('CREATE INDEX IF NOT EXISTS idx_app_channels_enabled ON app_channels(enabled)')
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_app_channel_thread_bindings_thread_id ON app_channel_thread_bindings(thread_id)'
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
  await ensureAssistantMaxStepsColumn(db)
  await ensureProviderSupportsVisionColumn(db)
  await ensureBuiltInProviderColumns(db)
  await ensureTeamTables(db)
  await ensureChannelsTables(db)
  await ensureThreadMetadataColumn(db)
  await ensureCronTables(db)

  return db
}
