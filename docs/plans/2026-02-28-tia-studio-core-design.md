# Tia Studio Core Design

**Date:** February 28, 2026  
**Status:** Approved (design phase)  
**Project:** `tia-studio` (slim Cherry Studio style app on Electron + React + Mastra)

---

## 1. Goals

Build a focused v1 desktop app with:

1. **Assistants** (agent + skills + model/provider + MCP + memory + workspace)
2. **Threads** (new thread/topic starts when user starts chatting)
3. **Provider settings foundation** (OpenAI, OpenAI-Response, Gemini, Anthropic, Ollama)
4. **Clean thread UI** with explicit rendering for:
   - reasoning
   - normal message text
   - tool calls/results

The app uses:

- Electron + React starter
- React Router for navigation
- Mastra in the **main process**
- AI SDK `useChat` in the **renderer**
- Local HTTP transport between renderer and main process

---

## 2. Confirmed Product Decisions

1. **Storage:** SQLite via Mastra libsql (`LibSQLStore`)
2. **Transport:** local HTTP server (not IPC direct transport)
3. **Assistant workspace scope:** per-assistant, required before chat starts
4. **Security:** server bound to `127.0.0.1` with per-install bearer token
5. **Thread UI stack:** assistant-ui primitives
6. **Provider model rule (v1):**
   - each provider has exactly one `selectedModel`
   - optional `providerModels` list for prebuilt providers (e.g. MiniMax-style preset providers)
7. **Identity model:** keep one standalone local profile now; use profile ID as Mastra `resourceId`

---

## 3. Runtime Architecture

### 3.1 Process split

- **Main process**
  - runs Mastra runtime and local HTTP server
  - owns DB access and secret handling
  - resolves assistant runtime configuration (provider/model/tools/mcp/skills/workspace/memory)
- **Renderer process**
  - React app and routes
  - calls local server through AI SDK transport
  - renders chat stream parts

### 3.2 Why local HTTP (chosen)

- Matches future goal: expose tia-studio services to other local programs
- Keeps renderer/backend boundary clean
- Reuses AI SDK `DefaultChatTransport` and streaming patterns

---

## 4. Data Model (SQLite/libsql)

Use a single SQLite/libsql database file in app data path.

### 4.1 Identity/profile

`app_profiles`

- `id` (UUID)
- `name`
- `isActive`
- timestamps

Use active profile `id` as Mastra memory `resource`.

### 4.2 Providers

`app_providers`

- `id` (UUID)
- `name`
- `type` (`openai | openai-response | gemini | anthropic | ollama | ...`)
- `apiKey`
- `apiHost`
- `selectedModel` (single selected model ID)
- `providerModels` (JSON array, optional preset list)
- `enabled`
- timestamps

### 4.3 Assistants

`app_assistants`

- `id` (UUID)
- `name`
- `instructions`
- `providerId`
- `workspaceConfig` (JSON, required for chat)
- `skillsConfig` (JSON references/config)
- `mcpConfig` (JSON references/config)
- `memoryConfig` (optional overrides)
- timestamps

### 4.4 Threads

`app_threads`

- `id` (UUID) -> used as Mastra memory `thread`
- `assistantId`
- `resourceId` (active profile ID snapshot)
- `title`
- `lastMessageAt`
- timestamps

Message content is stored/retrieved through Mastra memory storage keyed by `memory.resource + memory.thread`.

---

## 5. HTTP API Design

All routes served from main process server on `127.0.0.1:<port>`.
All routes require `Authorization: Bearer <install-token>`.

### 5.1 Core routes

- `GET /v1/health`
- `GET /v1/providers`
- `POST /v1/providers`
- `PATCH /v1/providers/:providerId`
- `GET /v1/assistants`
- `POST /v1/assistants`
- `PATCH /v1/assistants/:assistantId`
- `GET /v1/threads?assistantId=...`
- `POST /v1/threads`
- `PATCH /v1/threads/:threadId`
- `POST /chat/:assistantId` (AI SDK stream endpoint)

### 5.2 Chat request contract (renderer -> main)

Body contains AI SDK messages plus metadata:

- `threadId`
- `profileId` (active profile)
- optional UI metadata

Server flow:

1. validate token
2. load assistant
3. validate readiness:
   - workspace configured
   - provider enabled
   - provider `selectedModel` set
4. resolve runtime (skills/tools/MCP/workspace/memory/provider model)
5. call `agent.stream(messages, { format: 'aisdk', memory: { thread, resource } })`
6. return AI SDK-compatible UI stream response

---

## 6. UI + Routing Design

### 6.1 Routes

- `/` -> redirect to active assistant/thread
- `/assistants`
- `/assistants/:assistantId/threads/:threadId?`
- `/settings/providers`
- (reserve future settings routes for MCP, memory, data, etc.)

### 6.2 Main layout

- **Left panel:** assistants + threads/topics
- **Center panel:** chat timeline + composer
- **Top bar:** assistant name + provider/model badge + thread actions

### 6.3 Thread behavior

- Entering chat without a thread shows empty state
- First message auto-creates thread
- Thread title defaults from first message snippet (editable later)

### 6.4 Chat rendering requirements

Using assistant-ui primitives + AI SDK parts:

- `text` -> normal bubble
- `reasoning` -> collapsible reasoning section
- `tool-*` parts -> expandable tool cards with input/output/state

Also show streaming states (`thinking`, `tool running`, `error`, `done`).

### 6.5 Setup gating

Before chat starts, assistant must have:

- workspace configured
- provider assigned
- provider `selectedModel` configured

If not ready, thread page shows setup checklist CTA instead of active composer.

---

## 7. Security + Reliability Baseline

1. **Auth**
   - generate install token on first launch
   - store in app data, exposed to renderer via preload bridge
2. **Network boundary**
   - bind server to `127.0.0.1` only
3. **Validation**
   - strict provider and assistant readiness checks on chat route
4. **Error handling**
   - structured error response before stream start
   - interrupted-state UI if stream fails mid-response
5. **Logging**
   - request-scoped logs: requestId, assistantId, threadId, provider, duration, status

---

## 8. Delivery Slices (Implementation Order)

### Slice A: App skeleton and navigation

- React Router shell
- assistants/threads/settings routes
- placeholder views

### Slice B: Main process HTTP server + auth

- localhost server bootstrap
- token generation + auth middleware
- health endpoint

### Slice C: SQLite/libsql persistence

- profile/provider/assistant/thread schema
- repository layer
- seed default profile

### Slice D: Provider settings page (v1)

- CRUD provider UI
- fields: `apiKey`, `apiHost`, `selectedModel`, optional `providerModels`

### Slice E: Assistant management + readiness gating

- assistant CRUD
- provider binding
- workspace/skills/MCP config stubs + required validation

### Slice F: Chat transport + streaming UI

- `useChat` + `DefaultChatTransport` to local endpoint
- thread creation flow
- render text/reasoning/tool parts cleanly

### Slice G: hardening

- retry/reconnect behavior
- better error states
- smoke tests and packaging checks

---

## 9. Out of Scope for v1

- full profile-switching UX (schema ready, UI postponed)
- provider auto-fetch model catalogs
- complex key-rotation policies
- broad settings parity with Cherry Studio
- cloud sync/multi-device

---

## 10. External References Used

- Cherry Studio DeepWiki (overview + architecture + assistant/topic/provider/settings docs):  
  https://deepwiki.com/CherryHQ/cherry-studio
- Mastra `Agent.stream()` reference (memory `thread/resource`, deprecations):  
  https://mastra.ai/en/reference/streaming/agents/stream
- Mastra AI SDK UI guide (`@mastra/ai-sdk`, `chatRoute`, `handleChatStream`, `useChat` transport):  
  https://mastra.ai/guides/build-your-ui/ai-sdk-ui
- Mastra Electron guide (`/chat/:agentId` route pattern + Electron integration):  
  https://mastra.ai/guides/getting-started/electron
- Mastra custom API routes (for additional local endpoints):  
  https://mastra.ai/en/docs/server-db/custom-api-routes

