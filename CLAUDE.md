# CLAUDE.md

## Commands

```bash
pnpm run dev
pnpm run dev:annotate
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Desktop end-to-end testing must use `pnpm run e2e:guarded:annotate` or `pnpm run e2e:guarded`. Never launch an unguarded test app. Watch the guard log and process tree, and stop on repeated session creation, repeated 5xx responses, or excessive CPU.

## Architecture

TIA Studio is an Electron, React, and TypeScript application.

- `src/main/agents/` owns the embedded Pi Coding Agent SDK runtime, event mapping, and permissions.
- `src/main/server/` exposes the application-owned local HTTP/SSE API.
- `src/main/persistence/` owns the v3 application session schema and repositories.
- `src/main/channels/` maps external conversations directly to application sessions.
- `src/renderer/src/features/threads/` adapts application messages and commands to the official assistant-ui thread.
- `src/shared/agent-runtime.ts` contains the renderer-safe runtime protocol.

Pi executes in Electron main's Node.js process through `createAgentSession`. Do not add a CLI/RPC bridge, second harness, or remote execution adapter. Do not expose Pi SDK types or credentials to the renderer.

Chats begin with empty Pi history. Do not add application-side workspace prompt or identity-file preloading. Standard Access requires approval for risky operations; persisted Full Access skips those approvals while credential-file access stays blocked.

## Completion rules

- Preserve unrelated dirty work.
- Delete abandoned implementation and obsolete documentation instead of keeping compatibility layers.
- Run heavy gates sequentially at reduced priority.
- Clean all test-created sessions, messages, events, bindings, Pi files, artifacts, and app processes after runtime QA.
- Keep [TASKS.md](./TASKS.md) aligned with verified evidence.
