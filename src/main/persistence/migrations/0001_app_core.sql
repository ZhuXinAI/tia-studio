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
  selected_model_context_window_tokens INTEGER,
  provider_models TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  is_added INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  official_site TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  supervisor_provider_id TEXT,
  supervisor_model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supervisor_provider_id) REFERENCES app_providers(id)
);

CREATE TABLE IF NOT EXISTS app_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_channels (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS app_agent_sessions (
  id TEXT PRIMARY KEY,
  automation_id TEXT,
  upstream_session_id TEXT,
  upstream_session_file TEXT,
  workspace_id TEXT,
  workspace_path TEXT NOT NULL,
  title TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  thinking_level TEXT NOT NULL DEFAULT 'medium',
  access_mode TEXT NOT NULL DEFAULT 'standard',
  pinned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'starting',
  is_compacting INTEGER NOT NULL DEFAULT 0,
  queue_json TEXT NOT NULL DEFAULT '{"steering":[],"followUps":[]}',
  pending_interaction_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES app_workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES app_providers(id)
);

CREATE TABLE IF NOT EXISTS app_agent_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  parts_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  upstream_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES app_agent_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_agent_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES app_agent_sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, sequence)
);

CREATE TABLE IF NOT EXISTS app_channel_session_bindings (
  channel_id TEXT NOT NULL,
  remote_chat_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, remote_chat_id),
  FOREIGN KEY (channel_id) REFERENCES app_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES app_agent_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_profiles_is_active ON app_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_app_workspaces_supervisor_provider_id ON app_workspaces(supervisor_provider_id);
CREATE INDEX IF NOT EXISTS idx_app_channels_enabled ON app_channels(enabled);
CREATE INDEX IF NOT EXISTS idx_app_agent_sessions_workspace ON app_agent_sessions(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_agent_messages_session ON app_agent_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_app_agent_events_session_sequence ON app_agent_events(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_app_channel_session_bindings_session ON app_channel_session_bindings(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_channel_pairings_channel_sender ON app_channel_pairings(channel_id, remote_chat_id, sender_id);
CREATE INDEX IF NOT EXISTS idx_app_channel_pairings_channel_status ON app_channel_pairings(channel_id, status);
