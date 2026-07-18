# TIA Studio

[中文说明](./README_zh.md)

TIA Studio is a local-first Electron workspace for running Pi Coding Agent conversations against your files and tools. Folder-backed workspaces, the built-in Chats area, and external messaging channels all use one application-owned Pi runtime.

![TIA Studio workspace and Pi composer](./docs/screenshots/pi-workspace.png)

## What is available now

### Pi conversations

- Folder-backed workspaces plus a built-in Chats workspace for ad-hoc and channel-originated conversations
- A searchable, collapsible sidebar with automatic thread titles, pinning, and deletion
- Streaming text, reasoning, tool calls, tool results, permission requests, and errors
- Per-thread model selection and persisted **Ask Permission** or **Full Access** modes
- Image attachments and feature-detected native speech input
- Cancellation, steering, and follow-up queueing while Pi is running
- Local application metadata and Pi session files preserve conversations across app restarts

### Connections and configuration

- Locally stored provider profiles with custom endpoints, model lists, connection checks, vision support, and default selection
- MCP server configuration for stdio and URL-based servers
- Discord, Lark, Telegram, WhatsApp, WeChat, and WeCom channels routed into Pi threads in Chats
- Language selection, light/dark/system themes, and adjustable appearance colors

### Skills and automations

- A read-only Skills catalog discovered from global Codex, Claude, Agents, and workspace skill folders
- Search and source filters with incremental loading for large local catalogs
- A read-only Automations page for inspecting discovered Codex schedules, prompts, projects, models, status, and source files

TIA Studio does not currently install skills or create, edit, pause, or execute automation definitions from these catalog pages.

![TIA Studio local Skills catalog](./docs/screenshots/skills-catalog.png)

## Runtime architecture

- **Embedded Pi SDK** — Electron main imports the pinned `@earendil-works/pi-coding-agent` package and creates sessions in its Node.js host.
- **Application-owned API** — the renderer talks to a local HTTP/SSE boundary. Pi SDK objects and provider credentials never cross into the renderer.
- **Assistant UI** — the official assistant-ui thread renders empty, streaming, tool, approval, attachment, and error states.
- **Local persistence** — SQLite stores application session metadata and normalized events; Pi session files provide SDK restart and resume support.
- **One execution path** — desktop chat and channel delivery use the same embedded runtime. There is no alternate agent harness or external execution service.

Pi threads begin without injected identity, soul, memory, prompt, or preboot files. A selected workspace is passed directly to Pi; Chats uses an empty app-managed directory.

## Channels

Each remote conversation is persistently mapped to a Pi thread in Chats and runs with Standard Access. See [CHANNEL.md](./CHANNEL.md) for authentication, pairing, group-mention behavior, and channel commands.

## Development

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm run dev
```

For browser annotation while keeping Electron main as the API and Pi host:

```bash
pnpm run dev:annotate
```

Use the guarded desktop launchers for end-to-end validation:

```bash
pnpm run e2e:guarded:annotate
pnpm run e2e:guarded
```

The guard terminates the process tree on repeated session creation, repeated 5xx responses, sustained excessive CPU, or timeout.

## Validation and builds

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run build:mac:arm64
```

For migration decisions and the current runtime boundary, see [PI_MIGRATION.md](./PI_MIGRATION.md), [TASKS.md](./TASKS.md), and [docs/pi-migration/CURRENT_ARCHITECTURE.md](./docs/pi-migration/CURRENT_ARCHITECTURE.md).

## Tech stack

- Electron 39, React 19, TypeScript, and Vite
- `@earendil-works/pi-coding-agent`
- assistant-ui and Radix UI
- Hono and LibSQL/SQLite

## License

MIT
