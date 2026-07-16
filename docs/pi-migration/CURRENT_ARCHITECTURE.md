# Current v3 architecture

TIA Studio owns one local Pi Coding Agent runtime manager. Each live application session is an embedded Pi SDK `AgentSession` hosted inside Electron main; no Pi child process, alternate agent harness, or remote execution path exists.

## Runtime boundary

```text
official assistant-ui Thread
  -> application-owned external-store adapter
  -> authenticated localhost HTTP commands + ordered SSE events
  -> AgentRuntimeManager
  -> embedded ModelRuntime + AgentSession
```

- Electron main owns Pi SDK sessions, provider credentials, permissions, persistence, channels, and shutdown.
- The renderer uses application-owned session, message, content-part, interaction, command, and event schemas.
- Pi SDK and assistant-ui types remain inside their adapters.
- A live run continues when the renderer navigates between threads.

## Sessions and persistence

- `app_agent_sessions`, `app_agent_messages`, and `app_agent_events` are the application index.
- Pi's SDK-owned session file remains the upstream agent history for restart and resume.
- The v3 cutover starts with no legacy thread rows or history.
- Sessions belong directly to a workspace; there is no Assistant entity or Assistant ID.
- Chats uses an empty app-managed directory with no prompt, identity, soul, or memory preboot files.

## Permissions

- Standard Access allows routine work inside the selected workspace and requests approval for destructive, privileged, or outside-workspace actions.
- Full Access is persisted per session and skips approval gates.
- TIA Studio credential storage remains inaccessible in both modes.
- HTTP session creation resolves the authoritative workspace path server-side.

## User interface

- The AppV2 shell and thread list remain application-owned.
- The thread canvas is the official assistant-ui registry thread using `useExternalStoreRuntime`.
- The composer supports images and feature-detected native Web Speech dictation.
- New sessions render `ThreadEmpty`; active sessions support cancel plus steer/follow-up behavior.
- Text, reasoning, tools, errors, queues, recovery, and permission interactions map from application events.

## Channels and desktop features

- Channel conversations create or resume Standard Access Pi sessions in Chats.
- Pending channel approvals are surfaced in the same desktop session.
- `/new` creates a new Pi session and `/stop` cancels the active run.
- Existing automation discovery is read-only; any future app-owned trigger must enter through the same runtime manager.

## Packaging and gates

- `@earendil-works/pi-coding-agent` is pinned and packaged with its runtime dependencies.
- Electron main uses `ModelRuntime`, `SessionManager`, `DefaultResourceLoader`, and `createAgentSession` directly; no executable resolution exists.
- Release gates are lint, both TypeScript projects, the full Vitest suite, Electron/Vite build, and packaged-resource inspection.
