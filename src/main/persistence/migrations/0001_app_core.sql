CREATE TABLE IF NOT EXISTS app_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES app_providers(id)
);

CREATE TABLE IF NOT EXISTS app_threads (
  id TEXT PRIMARY KEY,
  assistant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assistant_id) REFERENCES app_assistants(id)
);

CREATE TABLE IF NOT EXISTS app_team_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS app_team_thread_members (
  team_thread_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_thread_id, assistant_id),
  FOREIGN KEY (team_thread_id) REFERENCES app_team_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_profiles_is_active ON app_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_app_assistants_provider_id ON app_assistants(provider_id);
CREATE INDEX IF NOT EXISTS idx_app_threads_assistant_id ON app_threads(assistant_id);
CREATE INDEX IF NOT EXISTS idx_app_threads_resource_id ON app_threads(resource_id);
CREATE INDEX IF NOT EXISTS idx_app_team_threads_workspace_id ON app_team_threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_app_team_threads_resource_id ON app_team_threads(resource_id);
CREATE INDEX IF NOT EXISTS idx_app_team_threads_supervisor_provider_id ON app_team_threads(supervisor_provider_id);
CREATE INDEX IF NOT EXISTS idx_app_team_thread_members_team_thread_id ON app_team_thread_members(team_thread_id);
CREATE INDEX IF NOT EXISTS idx_app_team_thread_members_assistant_id ON app_team_thread_members(assistant_id);
