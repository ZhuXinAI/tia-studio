# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm run dev              # Start Electron app with HMR
pnpm run build            # Typecheck + production build
pnpm run lint             # ESLint with cache
pnpm run format           # Prettier format all files
pnpm run typecheck        # Run both node and web typechecks
pnpm run test             # Vitest single run
pnpm run test:watch       # Vitest watch mode
pnpm run test:main        # Main process tests only (vitest run src/main)
pnpm run build:mac        # Build macOS distributable
pnpm run build:win        # Build Windows distributable
pnpm run build:linux      # Build Linux distributable
```

To run a single test file: `pnpm vitest run path/to/file.test.ts`

## Architecture

TIA Studio is a desktop AI assistant workspace: Electron + React + TypeScript.

### Three-Process Model

- **Main process** (`src/main/`): Runs a Hono HTTP server on `127.0.0.1:4769`, manages SQLite database, handles IPC, system tray, and auto-updates. This is the backend.
- **Preload** (`src/preload/`): Exposes `window.tiaDesktop` API via `contextBridge` for IPC calls (get config, pick directories, manage skills).
- **Renderer** (`src/renderer/`): React SPA that communicates with main process exclusively via the local HTTP API, not direct IPC for data operations.

### Data Flow

1. Renderer gets server URL + auth token via IPC bridge (`window.tiaDesktop.getConfig()`)
2. All data operations go through REST API (`src/renderer/src/lib/api-client.ts` → Hono routes)
3. API routes are protected with bearer token auth middleware
4. Routes validate with Zod, then delegate to repository classes for database access

### Main Process (`src/main/`)

- `server/` — Hono HTTP API: routes, validators, auth middleware, chat streaming
- `mastra/` — AI agent framework: `assistant-runtime.ts` manages agent lifecycle and caching; `model-resolver.ts` resolves models across providers (OpenAI, Anthropic, Gemini, Ollama)
- `persistence/` — SQLite via LibSQL: `repos/` has repository classes per entity, `migrations/` has SQL schema files
- `skills/` — Workspace skills discovery
- `web-search/` — Web search engine integration

### Renderer (`src/renderer/src/`)

- Feature-based organization: `features/threads/`, `features/assistants/`, `features/settings/`
- Each feature has query files (`*-query.ts`), pages, components, and hooks
- UI built with shadcn/ui (Radix primitives) + Assistant UI for chat interface
- Routing: react-router-dom HashRouter (`src/renderer/src/app/router.tsx`)
- No global state library — uses React hooks, `useChat` from `@ai-sdk/react` for streaming, localStorage for theme/profile

### AI Agent System

- Agents are Mastra `Agent` instances registered dynamically in `AssistantRuntimeService`
- Agents are cached by signature (hash of config values); re-registered when config changes
- Each agent gets: model (via provider), memory (Mastra Memory with LibSQL), workspace, tools (browser search + MCP tools)
- MCP (Model Context Protocol) client manages external tool servers per assistant

### Database

SQLite stored at `userData/tia-studio.db`. Key tables: `app_profiles`, `app_providers`, `app_assistants`, `app_threads`, `app_preferences`. JSON fields stored as TEXT.

### Claws (Assistant-Channel Management)

Claws is the management surface for connecting assistants to external channels (e.g., Lark). When working on claws-related features (channels, assistant activation, external integrations), **read `docs/claws.md` first** for the full architecture, data model, API routes, and design decisions.

## Code Style

- **Prettier**: Single quotes, no semicolons, 100-char width, no trailing commas
- **2-space indentation**, LF line endings
- **Tests**: Co-located with source files (`.test.ts`/`.test.tsx` alongside implementation)
- **Path alias**: `@renderer` maps to `src/renderer/src` (renderer code only)
- **Package manager**: pnpm (not npm/yarn)
