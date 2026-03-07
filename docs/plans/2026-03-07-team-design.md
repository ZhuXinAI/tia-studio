# Team Feature (Design)

## Context

TIA Studio currently has one primary chat surface under `/chat`, backed by assistant records, assistant-scoped threads, and a single assistant runtime. The new `Team` feature adds a parallel collaboration mode modeled after Codex-style multi-agent work: a manually managed workspace list, workspace-scoped threads, per-thread supervisor configuration, and live orchestration across existing assistants.

The existing assistant chat experience remains intact. Team mode is a separate route, storage model, and runtime path that reuses existing assistants as live team members rather than copying them.

## Goals

- Add a top-level `Team` route and nav entry parallel to `Home`.
- Support a manually managed list of Team workspaces (folders on the user’s machine).
- Support Team threads inside each Team workspace.
- Let each Team thread own its own configuration:
  - team description
  - supervisor provider
  - supervisor model
  - selected member assistants
- Resolve team members as live assistant references at runtime.
- Run Team chat through Mastra’s supervisor-agent pattern using `Agent({ agents })` plus `supervisor.stream(...)`.
- Show a three-column Team UI:
  - Team workspace/thread sidebar
  - Team chat panel
  - Team status graph/event log

## Non-goals

- No snapshotting of assistant configuration into Team threads.
- No mutation of `app_assistants.workspace_config` when running Team mode.
- No direct assistant-chat “use Team workspace” toggle in v1.
- No persisted status-event history in v1; chat history remains the durable record.
- No migration of the existing `/chat` experience into Team mode.

## Product Rules

### Ownership

- Assistants keep their own stored workspace configuration for direct assistant chat.
- Team workspaces are stored separately and managed manually by the user.
- Team threads own supervisor settings and member selection.
- Team member selection stores assistant IDs only.

### Live References

- Team threads always resolve selected assistants live at send time.
- Editing an assistant’s name, instructions, tools, skills, or provider affects Team execution immediately.
- Deleting or invalidating a selected assistant does not delete Team history; it marks the Team thread as needing reconfiguration before the next run.

### Workspace Behavior

- During Team execution, the selected Team workspace is injected as the shared runtime workspace for the supervisor and every delegated agent.
- This is a runtime override only.
- Direct assistant chat continues to use the assistant’s own stored workspace unless a future Team-context toggle is added.

## Information Architecture

### Routing

- `/chat/...` remains the assistant-chat surface.
- `/team` becomes the Team landing route.
- Recommended Team route shape:
  - `/team/:workspaceId?/:threadId?`

### Page Layout

- The Team page uses a three-column layout.
- Left column (`1/3`): Team workspaces and Team threads.
- Middle column (`1/3`): Team chat container.
- Right column (`1/3`): Team execution graph and event log.

### Interaction Model

- User selects a Team workspace.
- User selects or creates a Team thread.
- User configures Team thread members and supervisor settings.
- User sends a message.
- Supervisor coordinates selected assistants inside the Team workspace.
- Chat text streams in the middle column while execution state streams into the right column.

## Data Model

### `app_team_workspaces`

- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `root_path TEXT NOT NULL`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

Purpose:

- Stores manually managed Team workspaces.

### `app_team_threads`

- `id TEXT PRIMARY KEY`
- `workspace_id TEXT NOT NULL`
- `resource_id TEXT NOT NULL`
- `title TEXT NOT NULL`
- `team_description TEXT NOT NULL DEFAULT ''`
- `supervisor_provider_id TEXT`
- `supervisor_model TEXT NOT NULL DEFAULT ''`
- `last_message_at TEXT`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

Purpose:

- Stores Team-thread chat state plus per-thread supervisor settings.

### `app_team_thread_members`

- `team_thread_id TEXT NOT NULL`
- `assistant_id TEXT NOT NULL`
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- composite primary key on (`team_thread_id`, `assistant_id`)

Purpose:

- Stores live assistant references for a Team thread.

### Relationship Rules

- A Team workspace has many Team threads.
- A Team thread has many member assistants through `app_team_thread_members`.
- Deleting a Team workspace deletes its Team threads and Team-thread members.
- Deleting a Team thread deletes only its membership rows and Team-thread record.
- Deleting an assistant does not delete Team threads; the missing assistant is treated as invalid configuration until fixed.

## API Design

### Team Workspace Endpoints

- `GET /v1/team/workspaces`
- `POST /v1/team/workspaces`
- `PATCH /v1/team/workspaces/:workspaceId`
- `DELETE /v1/team/workspaces/:workspaceId`

### Team Thread Endpoints

- `GET /v1/team/threads?workspaceId=...`
- `POST /v1/team/threads`
- `PATCH /v1/team/threads/:threadId`
- `DELETE /v1/team/threads/:threadId`
- `PUT /v1/team/threads/:threadId/members`

### Team Chat Endpoints

- `GET /team-chat/:threadId/history?profileId=...`
- `POST /team-chat/:threadId`
- `GET /team-chat/:threadId/runs/:runId/status`

### Validation

- Team workspace name and root path must be non-empty.
- Team thread creation requires a valid `workspaceId`, `resourceId`, and title.
- Team thread update validates `teamDescription`, `supervisorProviderId`, and `supervisorModel`.
- Team member update accepts a deduplicated ordered list of assistant IDs.
- Team chat blocks when the Team thread has:
  - no valid workspace
  - no selected members
  - invalid supervisor provider/model
  - zero runnable live assistants after resolution

## Runtime Design

### Runtime Service

- Add a dedicated `TeamRuntimeService`.
- Keep it separate from `AssistantRuntimeService` because Team chat needs:
  - Team-thread persistence
  - supervisor assembly
  - member validation
  - Team workspace override
  - streamed Team status events

### Supervisor Assembly

On each Team send:

1. Load the Team thread and Team workspace.
2. Resolve selected member assistant IDs from `app_team_thread_members`.
3. Resolve live assistant records.
4. Resolve the Team thread’s supervisor provider and model.
5. Build one delegated `Agent` per runnable assistant:
   - assistant instructions come from the live assistant record
   - assistant tools/MCP/skills come from the live assistant record
   - assistant `maxSteps` comes from the live assistant record
   - workspace is overridden to the Team workspace root path
6. Build a supervisor `Agent` with:
   - Team-thread description in instructions
   - Team provider/model
   - `agents: { ...memberAgents }`
   - memory configured against the existing Mastra storage
7. Execute `supervisor.stream(messages, options)`

### Mastra Integration

- Use the installed supervisor-agent pattern instead of deprecated `.network()`.
- Convert the supervisor stream with `toAISdkV5Stream(..., { from: 'agent' })` so the middle chat panel can keep using AI SDK-compatible message streaming.
- Reuse the app’s existing Mastra storage-backed memory so Team chat history is retrievable by Team thread ID + resource ID.

### Team Workspace Override

- Team runtime constructs member workspaces from the Team workspace root path.
- The live assistant’s own workspace path is not modified in storage.
- All Team agents operate in the same runtime workspace during a Team run.

### Status Event Model

The right column consumes lightweight runtime events keyed by run ID:

- `run-started`
- `delegation-started`
- `delegation-finished`
- `iteration-complete`
- `run-finished`
- `run-failed`

Recommended node states:

- supervisor: `idle | thinking | delegating | synthesizing | done | error`
- member: `idle | queued | running | done | error`
- edge: `inactive | active | completed`

### Status Transport

- Use a parallel streaming endpoint for Team status updates.
- Prefer authenticated `fetch` streaming over browser `EventSource`, because the renderer currently authenticates requests with a bearer token header.
- The status stream can use SSE framing or NDJSON over `fetch`, as long as the renderer can pass `Authorization`.

## UI / UX

### Left Column

- Shows Team workspaces and Team threads.
- Provides `New Workspace` and `New Team Thread` actions.
- Selecting a workspace filters the displayed Team threads to that workspace.

### Middle Column

- Reuses the general chat feel from the existing thread chat surface.
- Header shows:
  - Team thread title
  - Team workspace name
  - supervisor provider/model
  - member count
- `Configure Team` opens a Team-thread configuration dialog.

### Team Configuration Dialog

- Editable fields:
  - Team thread title
  - team description
  - supervisor provider
  - supervisor model
  - assistant member multiselect
- Member selection is based on existing assistants.
- Invalid members are shown explicitly if referenced assistants disappear or become unrunnable.

### Right Column

- Render Team status with `reactflow` in v1.
- Place supervisor node centrally with member nodes around it.
- Drive node and edge styles from streamed runtime events.
- Include a readable event log so users can understand progress without interpreting only graph colors.

### Setup Blockers

- If no Team workspace is selected, prompt the user to create one.
- If no Team thread is configured, block send and show the setup checklist.
- If no members are selected, block send and explain the missing configuration.
- If the supervisor provider/model is invalid, block send but keep history visible.

## Error Handling

- Missing/invalid live assistant references block new execution but do not erase history.
- Member-agent failures show in both status graph and event log.
- The supervisor continues by default unless no runnable members remain or the supervisor itself fails.
- Team runtime errors are surfaced to the chat panel and status panel with concise, user-readable messaging.

## Testing Strategy

- Persistence tests for Team workspace/thread/member CRUD behavior.
- Route tests for validation, 404 handling, and membership updates.
- Runtime tests for:
  - live assistant resolution
  - Team workspace override
  - supervisor stream setup
  - emitted status events
- Renderer tests for:
  - nav and routing
  - Team sidebar behavior
  - Team-thread setup blockers
  - Team status graph/event mapping

## Edge Cases

- Referenced assistant deleted after the Team thread was configured.
- Supervisor provider disabled after the Team thread was configured.
- Duplicate assistant IDs submitted in Team membership updates.
- Team workspace path no longer exists at execution time.
- Team run aborted while status stream is still open.
- Team thread title should continue to auto-sync from the generated first message when the stored title is empty or still a generic placeholder.

## Phasing

### Phase 1

- Team persistence
- Team REST endpoints
- Team runtime
- Team chat
- Team status graph + event log
- Team configuration dialog

### Phase 2

- Assistant direct-chat “use Team workspace” toggle
- richer graph interactions
- resumable Team runs
- persisted Team event history if later needed
