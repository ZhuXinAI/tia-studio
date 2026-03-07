# Team Feature (Design)

## Context

The first Team implementation shipped with the wrong ownership model: supervisor configuration and member selection live on each team thread. In practice, a team workspace is the team. That means configuration should belong to the workspace, remain available even when no thread is selected, and apply consistently across every conversation inside that workspace.

The current sidebar also reads as two disconnected lists rather than a Codex-style nested hierarchy. The assistant thread surface already has the right interaction pattern to copy: collapsible top-level items with nested threads.

## Goals

- Make `workspace == team` the core product rule.
- Move team configuration to workspace ownership:
  - team description
  - supervisor provider
  - supervisor model
  - selected member assistants
- Allow `Configure Team` whenever a workspace is selected, including while a thread is selected.
- Open `Configure Team` immediately after `New Workspace`.
- Remove thread-title editing from the team configuration flow.
- Generate team thread titles from supervisor memory with `generateTitle: true`.
- Rebuild the team sidebar to follow the existing Codex-style collapsible pattern already used in assistant threads.

## Non-goals

- No merge of `/team` and `/chat` into a single surface.
- No assistant snapshotting into team records.
- No change to direct assistant chat workspace ownership.
- No full SQLite table rebuild just to physically drop the old thread-owned config columns in this pass.

## Product Rules

### Workspace Owns Team Configuration

- A team workspace is the team.
- Team configuration is stored on the workspace, not on individual threads.
- Every thread inside the workspace uses the same team description, supervisor provider/model, and member roster.

### Threads Are Conversations Only

- Team threads store conversation identity, title, timestamps, and resource binding.
- Threads do not own supervisor settings or member selection.
- Creating a thread never asks for team configuration.

### Configuration Entry Points

- Selecting a workspace enables `Configure Team`.
- Selecting a thread inside a workspace still enables `Configure Team`, but the dialog edits the workspace/team configuration.
- `New Workspace` flow is:
  1. pick a local folder
  2. create the workspace/team record
  3. navigate to that workspace
  4. immediately open `Configure Team`

### Thread Titles

- The team configuration dialog no longer shows a thread title field.
- New team threads are created with an empty title.
- The supervisor memory remains configured with `generateTitle: true`.
- After the first successful run, the generated title is synced back into the stored thread record.
- Until a title is generated, the UI shows a fallback label such as `Untitled Team Thread`.

### Live Assistant References

- Workspace member selection stores assistant IDs only.
- Team execution always resolves live assistant records at send time.
- Assistant edits affect future team runs immediately.
- Missing or unrunnable assistants make the team not ready until reconfigured.

## Data Model

### `app_team_workspaces`

Keep the existing workspace identity fields and add workspace-owned team configuration:

- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `root_path TEXT NOT NULL`
- `team_description TEXT NOT NULL DEFAULT ''`
- `supervisor_provider_id TEXT`
- `supervisor_model TEXT NOT NULL DEFAULT ''`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

Purpose:

- Stores both the team workspace identity and the active team configuration.

### `app_team_workspace_members`

- `workspace_id TEXT NOT NULL`
- `assistant_id TEXT NOT NULL`
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- composite primary key on (`workspace_id`, `assistant_id`)

Purpose:

- Stores the workspace/team member roster in stable order.

### `app_team_threads`

Threads remain conversation records:

- `id TEXT PRIMARY KEY`
- `workspace_id TEXT NOT NULL`
- `resource_id TEXT NOT NULL`
- `title TEXT NOT NULL`
- `last_message_at TEXT`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

Implementation note:

- The existing SQLite table currently also contains `team_description`, `supervisor_provider_id`, and `supervisor_model`.
- In this pass, those legacy thread-owned columns may remain physically present for migration safety, but the application stops reading and writing them as the source of truth.

### Legacy Thread Member Data

- The existing `app_team_thread_members` table becomes legacy data after migration.
- The active source of truth moves to `app_team_workspace_members`.
- This pass can leave the old table in place to avoid destructive migration risk, but runtime and UI code must stop depending on it.

## Migration Strategy

- Add the new workspace config columns if they do not already exist.
- Create `app_team_workspace_members` if it does not already exist.
- Backfill each workspace’s team config from the most recently updated thread in that workspace that has any non-empty config.
- Backfill workspace members from the same winning thread’s member rows.
- Make the migration idempotent so existing installs can run it safely more than once.
- Leave legacy thread-owned config columns and thread-member rows untouched in this pass; they are ignored after migration.

## API Design

### Team Workspace Endpoints

- `GET /v1/team/workspaces`
- `POST /v1/team/workspaces`
- `PATCH /v1/team/workspaces/:workspaceId`
- `DELETE /v1/team/workspaces/:workspaceId`
- `GET /v1/team/workspaces/:workspaceId/members`
- `PUT /v1/team/workspaces/:workspaceId/members`

`PATCH /v1/team/workspaces/:workspaceId` now accepts both identity and config fields:

- `name?`
- `rootPath?`
- `teamDescription?`
- `supervisorProviderId?`
- `supervisorModel?`

### Team Thread Endpoints

- `GET /v1/team/threads?workspaceId=...`
- `POST /v1/team/threads`
- `DELETE /v1/team/threads/:threadId`

Thread creation no longer requires a title from the renderer:

- `workspaceId`
- `resourceId`

The server creates the thread with an empty title so runtime-generated titles can replace it naturally.

`PATCH /v1/team/threads/:threadId` becomes optional maintenance-only surface if retained, and is no longer part of the renderer’s team configuration flow.

### Team Chat Endpoints

- `GET /team-chat/:threadId/history?profileId=...`
- `POST /team-chat/:threadId`
- `GET /team-chat/:threadId/runs/:runId/status`

## Runtime Design

### Readiness Source of Truth

Team readiness is computed from:

- selected workspace existence
- workspace root path
- workspace supervisor provider/model
- workspace member roster
- existence of the selected thread

Thread config is no longer part of readiness.

### Team Runtime

On each team send:

1. Load the selected team thread.
2. Load the owning workspace/team.
3. Resolve workspace member assistant IDs from `app_team_workspace_members`.
4. Resolve live assistant records.
5. Resolve supervisor provider/model from the workspace.
6. Build delegated member agents against the workspace root path.
7. Build the supervisor agent using the workspace team description.
8. Stream the run and status events.

### Generated Title Sync

Mirror the assistant runtime behavior in `TeamRuntimeService`:

- after a successful stream, touch `last_message_at`
- inspect Mastra memory for the generated thread title
- replace the stored title when the current title is empty or still a placeholder

This is the missing piece that makes titleless thread creation viable.

## UI / UX

### Sidebar

- Replace the card-based team sidebar with the same nested sidebar primitives already used in `src/renderer/src/features/threads/components/thread-sidebar.tsx`.
- Workspaces render as top-level items.
- Threads render as nested items under the selected/expanded workspace.
- The selected workspace auto-expands.
- The selected thread highlights within its workspace group.

### Team Configuration Dialog

- The dialog becomes workspace-scoped.
- Remove the thread title field.
- Keep:
  - team description
  - supervisor provider
  - supervisor model
  - team member multi-select
- Dialog copy must refer to the team/workspace, not the thread.

### Chat Header

- `Configure Team` is enabled whenever a workspace is selected.
- If a thread is selected, the header still shows the thread title and member count, but the config action edits workspace/team settings.
- `New Team Thread` only creates a new conversation in the active workspace.

### Empty and Incomplete States

- No selected workspace: prompt to create or select a team.
- Selected workspace without config: show incomplete setup banner and route the user to `Configure Team`.
- Selected workspace with config but no thread: prompt to create a new team thread.

## Testing Strategy

- Persistence tests cover new workspace config columns, workspace members, and idempotent backfill.
- Route and query tests cover workspace config patching and workspace member endpoints.
- Runtime tests cover workspace-owned readiness and generated title sync.
- Controller tests cover:
  - config availability with workspace-only selection
  - immediate config open after `New Workspace`
  - thread creation without a title field
- Component tests cover:
  - collapsible workspace/thread sidebar behavior
  - workspace-scoped configuration dialog
  - removal of the thread title field

## Follow-up

- After this ships and migrates safely, a later cleanup can physically remove deprecated thread-owned config columns and the legacy `app_team_thread_members` table.
