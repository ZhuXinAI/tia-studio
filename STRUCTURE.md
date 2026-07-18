# TIA Studio source structure

## Runtime boundary

Electron main is the sole owner of Pi Coding Agent sessions, credentials, filesystem tools, persistence, channels, and local API lifecycle. The renderer consumes application-owned HTTP/SSE schemas and never imports Pi SDK types.

## `src/main`

- `agents/` — embedded Pi session lifecycle, SDK event mapping, permission extension, and model/runtime configuration.
- `channels/` — Discord, Lark, Telegram, WhatsApp, WeChat, and WeCom adapters plus remote-chat-to-session routing.
- `config/` — local server and application configuration.
- `desktop/` — desktop bootstrap plus read-only discovery of local skills and Codex automation definitions.
- `persistence/` — SQLite migrations and repositories for profiles, providers, workspaces, channels, application sessions, normalized messages, and events.
- `server/` — Hono application, authentication, validators, provider checks, and local HTTP/SSE routes.
- `skills/` — local skill discovery. The current renderer catalog is read-only, and skill-loading policy must not become a workspace prompt preloader.
- `web-search/` — web-search settings and provider integration.

`index.ts` composes these services and owns startup/disposal. Pi is imported as a library and runs inside this Node.js host process.

## `src/renderer`

- `app/` — routing, desktop shell, navigation, and global providers.
- `components/assistant-ui/` — the official assistant-ui thread foundation and its rendering primitives.
- `features/threads/` — session list/data queries and the external-store adapter that maps application events and commands to assistant-ui.
- `features/workspaces/` — workspace selection and workspace-backed session surfaces.
- `features/settings/` — providers, channels, MCP servers, language, display, updates, and other supported settings.
- `features/skills/` — read-only local skill catalog with source filtering and incremental loading.
- `features/automations/` — read-only inspection of discovered Codex automation definitions.
- `lib/` — local API client and desktop bootstrap helpers.

## `src/shared`

`agent-runtime.ts` defines the application-owned session, message, event, command, interaction, attachment, access-mode, and error schemas shared across the local API boundary.

## Data flow

1. The renderer or a channel adapter sends an application command.
2. Electron main validates authorization, workspace ownership, and payload shape.
3. The runtime manager creates or resumes an embedded Pi SDK session.
4. Pi events are mapped to stable application events and persisted.
5. Ordered SSE updates reach the renderer; channel responses return through the channel adapter.
6. Standard Access pauses risky operations for approval. Full Access visibly bypasses approval while credential storage remains protected.

## Tests and packaging

- Unit and integration tests live beside their source files.
- `scripts/guarded-desktop-e2e.mjs` is the only supported E2E launcher.
- `electron.vite.config.ts` bundles the ESM-only Pi SDK into Electron main.
- `electron-builder.yml` packages the SDK and unpacks native image/WASM resources required by Pi.

For accepted migration decisions, see [PI_MIGRATION.md](./PI_MIGRATION.md), [TASKS.md](./TASKS.md), and [docs/adr](./docs/adr).
