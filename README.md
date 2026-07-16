# TIA Studio

[中文说明](./README_zh.md)

TIA Studio is a local-first Electron workspace for running Pi Coding Agent conversations against your files and tools. Chats, external channels, and future app-owned automation entry points share one application runtime contract.

## Runtime architecture

- **Embedded Pi SDK** — Electron main imports `@earendil-works/pi-coding-agent` and creates sessions in its Node.js host with `ModelRuntime`, `SessionManager`, and `createAgentSession`.
- **Application-owned API** — the renderer talks to a local HTTP/SSE boundary. Pi SDK objects and credentials never cross into the renderer.
- **Assistant UI** — the official assistant-ui thread renders streaming text, reasoning, tool calls, approvals, attachments, and empty conversations.
- **Local persistence** — SQLite stores application session metadata and normalized events; Pi session files provide SDK restart/resume support.
- **One local execution path** — desktop chat and channel delivery use the same embedded runtime. There is no alternate agent harness or external execution service.

Pi begins with empty v3 history. TIA Studio does not preload identity, soul, memory, or prompt files into a workspace. A user-selected workspace is passed directly to Pi; a chat without one uses an empty app-managed directory.

## Chat features

- Thread list with create, rename, delete, and restart/resume support
- Streaming text, reasoning, tool calls, tool results, and errors
- Image attachments
- Native speech input when the operating system/browser engine supports it
- Standard Access approvals for risky operations
- Per-thread Full Access, which visibly skips approval prompts while credential-file access remains blocked
- Steering, follow-up queueing, and cancellation during a run

## Channels

TIA Studio supports Discord, Lark, Telegram, WhatsApp, Wecom, and Wechat-KF. Remote conversations are mapped directly to application sessions and delivered through the same Pi runtime used by desktop chat.

See [CHANNEL.md](./CHANNEL.md) for channel-specific setup.

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

Use only the guarded desktop launchers for end-to-end testing:

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

For the migration decisions and current architecture, see [PI_MIGRATION.md](./PI_MIGRATION.md), [TASKS.md](./TASKS.md), and [docs/pi-migration/CURRENT_ARCHITECTURE.md](./docs/pi-migration/CURRENT_ARCHITECTURE.md).

## Tech stack

- Electron 39, React 19, TypeScript, Vite
- `@earendil-works/pi-coding-agent`
- assistant-ui and Radix UI
- Hono and LibSQL/SQLite

## License

MIT
