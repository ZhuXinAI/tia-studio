# TIA Studio Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a working v1 Electron desktop app with assistant management, thread chat, provider settings, and Mastra-powered streaming via localhost HTTP.

**Architecture:** Main process hosts a token-protected `127.0.0.1` HTTP server and Mastra runtime with `LibSQLStore`. Renderer uses React Router + assistant-ui + AI SDK `useChat` (`DefaultChatTransport`) to call local chat and settings APIs.

**Tech Stack:** Electron + electron-vite + React + TypeScript, React Router, AI SDK 6, Mastra (`@mastra/core`, `@mastra/libsql`, `@mastra/ai-sdk`), Hono, libsql SQLite, Vitest.

---

## Execution rules

- Apply **TDD** per task (red -> green -> refactor).
- Keep commits small and frequent (one commit per task).
- Use `@superpowers/test-driven-development` and `@superpowers/verification-before-completion`.
- Do not implement future-only scope (profile switching UI, provider model auto-fetch, cloud sync).

---

### Task 1: Foundation and test harness

**Files:**

- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/main/config/server-config.ts`
- Test: `src/main/config/server-config.test.ts`

**Step 1: Add core dependencies and scripts**

Run:

```bash
pnpm add @mastra/core @mastra/libsql @mastra/ai-sdk @libsql/client hono @hono/node-server @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google ollama-ai-provider @ai-sdk/react react-router-dom @assistant-ui/react zod
pnpm add -D vitest @vitest/coverage-v8
```

Then add scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:main": "vitest run src/main"
}
```

**Step 2: Write failing test for server config parser**

```ts
import { describe, expect, it } from 'vitest'
import { resolveServerConfig } from './server-config'

describe('resolveServerConfig', () => {
  it('forces localhost and generates token when missing', () => {
    const config = resolveServerConfig({})
    expect(config.host).toBe('127.0.0.1')
    expect(config.token.length).toBeGreaterThan(20)
  })
})
```

**Step 3: Run test to verify failure**

Run: `pnpm vitest run src/main/config/server-config.test.ts`  
Expected: FAIL with module/function not found.

**Step 4: Implement minimal config module**

```ts
import { randomUUID } from 'node:crypto'

export function resolveServerConfig(input: { port?: number; token?: string }) {
  return {
    host: '127.0.0.1',
    port: input.port ?? 4769,
    token: input.token ?? `tia_${randomUUID().replaceAll('-', '')}`
  }
}
```

**Step 5: Re-run test and commit**

Run: `pnpm vitest run src/main/config/server-config.test.ts`  
Expected: PASS

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/test/setup.ts src/main/config/server-config.ts src/main/config/server-config.test.ts
git commit -m "chore: add mastra stack and test harness"
```

---

### Task 2: SQLite/libsql schema + repositories

**Files:**

- Create: `src/main/persistence/migrations/0001_app_core.sql`
- Create: `src/main/persistence/client.ts`
- Create: `src/main/persistence/migrate.ts`
- Create: `src/main/persistence/repos/profiles-repo.ts`
- Create: `src/main/persistence/repos/providers-repo.ts`
- Create: `src/main/persistence/repos/assistants-repo.ts`
- Create: `src/main/persistence/repos/threads-repo.ts`
- Test: `src/main/persistence/migrate.test.ts`

**Step 1: Write failing migration test**

```ts
import { expect, it } from 'vitest'
import { migrateAppSchema } from './migrate'

it('creates core app tables', async () => {
  const db = await migrateAppSchema(':memory:')
  const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'")
  expect(tables.rows.some((r) => r.name === 'app_profiles')).toBe(true)
})
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run src/main/persistence/migrate.test.ts`  
Expected: FAIL with missing migration functions/files.

**Step 3: Add SQL migration + migrate function**

```sql
CREATE TABLE IF NOT EXISTS app_profiles (...);
CREATE TABLE IF NOT EXISTS app_providers (...);
CREATE TABLE IF NOT EXISTS app_assistants (...);
CREATE TABLE IF NOT EXISTS app_threads (...);
```

Include required columns from design: provider `selected_model`, optional `provider_models` JSON text, assistant `workspace_config`, thread `resource_id`.

**Step 4: Add repositories + default profile seed**

- `profiles-repo.ensureDefaultProfile()`
- `providers-repo` CRUD (single selected model rule)
- `assistants-repo` CRUD
- `threads-repo` create/list/update title

**Step 5: Run tests and commit**

Run: `pnpm vitest run src/main/persistence/migrate.test.ts`  
Expected: PASS

```bash
git add src/main/persistence
git commit -m "feat: add libsql schema and repositories"
```

---

### Task 3: Main HTTP server bootstrap + token auth

**Files:**

- Create: `src/main/server/create-app.ts`
- Create: `src/main/server/auth-middleware.ts`
- Create: `src/main/server/routes/health-route.ts`
- Modify: `src/main/index.ts`
- Test: `src/main/server/auth-middleware.test.ts`
- Test: `src/main/server/health-route.test.ts`

**Step 1: Write failing auth middleware tests**

```ts
it('returns 401 without bearer token', async () => { ... });
it('allows request with valid bearer token', async () => { ... });
```

**Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/main/server/auth-middleware.test.ts`  
Expected: FAIL.

**Step 3: Implement Hono app factory and middleware**

```ts
app.use('/v1/*', authMiddleware(token))
app.get('/v1/health', (c) => c.json({ ok: true }))
```

Bind in main startup:

```ts
serve({ fetch: app.fetch, hostname: '127.0.0.1', port })
```

**Step 4: Add health route test**

```ts
expect(res.status).toBe(200)
expect(body.ok).toBe(true)
```

**Step 5: Run tests and commit**

Run:

```bash
pnpm vitest run src/main/server/auth-middleware.test.ts src/main/server/health-route.test.ts
```

Expected: PASS

```bash
git add src/main/index.ts src/main/server
git commit -m "feat: bootstrap localhost http server with bearer auth"
```

---

### Task 4: Provider + assistant + thread REST routes

**Files:**

- Create: `src/main/server/routes/providers-route.ts`
- Create: `src/main/server/routes/assistants-route.ts`
- Create: `src/main/server/routes/threads-route.ts`
- Create: `src/main/server/validators/*.ts`
- Test: `src/main/server/routes/providers-route.test.ts`
- Test: `src/main/server/routes/assistants-route.test.ts`
- Test: `src/main/server/routes/threads-route.test.ts`

**Step 1: Write failing providers route tests**

Cover:

- create provider with `type`, `apiKey`, `apiHost`, `selectedModel`
- reject missing `selectedModel`
- support optional `providerModels`

**Step 2: Run test to verify failure**

Run: `pnpm vitest run src/main/server/routes/providers-route.test.ts`  
Expected: FAIL.

**Step 3: Implement providers route with zod validation**

```ts
const ProviderSchema = z.object({
  type: z.enum(['openai', 'openai-response', 'gemini', 'anthropic', 'ollama']),
  apiKey: z.string().min(1),
  apiHost: z.string().optional(),
  selectedModel: z.string().min(1),
  providerModels: z.array(z.string()).optional()
})
```

**Step 4: Repeat TDD for assistants and threads routes**

Assistants:

- create/update assistant
- enforce `providerId` reference
- store workspace/skills/mcp JSON config

Threads:

- list by assistant
- create thread with `resourceId`
- update title

**Step 5: Run route tests and commit**

Run:

```bash
pnpm vitest run src/main/server/routes/providers-route.test.ts src/main/server/routes/assistants-route.test.ts src/main/server/routes/threads-route.test.ts
```

Expected: PASS

```bash
git add src/main/server/routes src/main/server/validators
git commit -m "feat: add providers assistants and threads APIs"
```

---

### Task 5: Mastra runtime + model resolver + chat stream route

**Files:**

- Create: `src/main/mastra/store.ts`
- Create: `src/main/mastra/model-resolver.ts`
- Create: `src/main/mastra/assistant-runtime.ts`
- Create: `src/main/server/routes/chat-route.ts`
- Create: `src/main/server/chat/chat-errors.ts`
- Test: `src/main/mastra/model-resolver.test.ts`
- Test: `src/main/server/routes/chat-route.test.ts`

**Step 1: Write failing model resolver test**

Cover mappings:

- `openai` -> `openai(model)`
- `openai-response` -> `openai.responses(model)`
- `gemini` -> `google(model)`
- `anthropic` -> `anthropic(model)`
- `ollama` -> `ollama(model)`

**Step 2: Run test to verify failure**

Run: `pnpm vitest run src/main/mastra/model-resolver.test.ts`  
Expected: FAIL.

**Step 3: Implement resolver + assistant runtime factory**

- Create `Mastra` instance with `LibSQLStore`
- Build `Agent` from assistant config
- Wire workspace/skills/tools/MCP configuration hooks (v1 minimal but real shape)

**Step 4: Add failing chat route test, then implement**

Route: `POST /chat/:assistantId`

Required behavior:

- validate assistant readiness (workspace/provider/model)
- accept `threadId` and `profileId`
- call:

```ts
agent.stream(messages, {
  format: 'aisdk',
  memory: { thread: threadId, resource: profileId }
})
```

- return AI SDK stream response

**Step 5: Run tests and commit**

Run:

```bash
pnpm vitest run src/main/mastra/model-resolver.test.ts src/main/server/routes/chat-route.test.ts
```

Expected: PASS

```bash
git add src/main/mastra src/main/server/routes/chat-route.ts src/main/server/chat
git commit -m "feat: add mastra runtime and chat streaming route"
```

---

### Task 6: Preload bridge + renderer API client

**Files:**

- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Create: `src/renderer/src/lib/desktop-config.ts`
- Create: `src/renderer/src/lib/api-client.ts`
- Test: `src/renderer/src/lib/api-client.test.ts`

**Step 1: Write failing API client auth header test**

```ts
expect(fetchSpy).toHaveBeenCalledWith(
  expect.any(String),
  expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer test-token' })
  })
)
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run src/renderer/src/lib/api-client.test.ts`  
Expected: FAIL.

**Step 3: Expose desktop config through preload**

Expose:

- `baseUrl`
- `authToken`

```ts
contextBridge.exposeInMainWorld('tiaDesktop', { getConfig: () => ({ ... }) });
```

**Step 4: Implement API client wrapper**

- typed `get/post/patch`
- auto `Authorization` header
- JSON/error normalization

**Step 5: Re-run tests and commit**

Run: `pnpm vitest run src/renderer/src/lib/api-client.test.ts`  
Expected: PASS

```bash
git add src/preload/index.ts src/preload/index.d.ts src/renderer/src/lib
git commit -m "feat: add preload desktop config and typed renderer api client"
```

---

### Task 7: Router shell + app state scaffolding

**Files:**

- Modify: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/app/router.tsx`
- Create: `src/renderer/src/app/layout/app-shell.tsx`
- Create: `src/renderer/src/features/assistants/pages/assistants-page.tsx`
- Create: `src/renderer/src/features/threads/pages/thread-page.tsx`
- Create: `src/renderer/src/features/settings/pages/providers-settings-page.tsx`
- Test: `src/renderer/src/app/router.test.tsx`

**Step 1: Write failing router test**

Assertions:

- `/` redirects to assistants/thread view
- `/settings/providers` renders providers settings page

**Step 2: Run test to verify failure**

Run: `pnpm vitest run src/renderer/src/app/router.test.tsx`  
Expected: FAIL.

**Step 3: Implement router and shell**

- React Router route table
- left sidebar + center content region

**Step 4: Add placeholder pages with typed loaders**

- assistants list placeholder
- thread placeholder
- provider settings placeholder

**Step 5: Re-run tests and commit**

Run: `pnpm vitest run src/renderer/src/app/router.test.tsx`  
Expected: PASS

```bash
git add src/renderer/src/main.tsx src/renderer/src/app src/renderer/src/features
git commit -m "feat: add router shell and core app pages"
```

---

### Task 8: Provider settings UI (single selected model rule)

**Files:**

- Create: `src/renderer/src/features/settings/providers/providers-query.ts`
- Create: `src/renderer/src/features/settings/providers/providers-form.tsx`
- Modify: `src/renderer/src/features/settings/pages/providers-settings-page.tsx`
- Test: `src/renderer/src/features/settings/providers/providers-form.test.tsx`

**Step 1: Write failing provider form validation test**

Cover:

- submit blocked when `selectedModel` empty
- optional `providerModels` list shown for prebuilt providers

**Step 2: Run test to verify failure**

Run: `pnpm vitest run src/renderer/src/features/settings/providers/providers-form.test.tsx`  
Expected: FAIL.

**Step 3: Implement providers list + edit panel**

Form fields:

- provider type
- API key
- API host
- selected model (required)
- provider models list editor (optional)

**Step 4: Implement save/update with API client**

- optimistic loading state
- success/error toasts

**Step 5: Re-run tests and commit**

Run: `pnpm vitest run src/renderer/src/features/settings/providers/providers-form.test.tsx`  
Expected: PASS

```bash
git add src/renderer/src/features/settings
git commit -m "feat: implement providers settings with selected model rule"
```

---

### Task 9: Assistant + thread management UI with readiness gate

**Files:**

- Create: `src/renderer/src/features/assistants/assistants-query.ts`
- Create: `src/renderer/src/features/assistants/assistant-editor.tsx`
- Create: `src/renderer/src/features/threads/threads-query.ts`
- Modify: `src/renderer/src/features/threads/pages/thread-page.tsx`
- Test: `src/renderer/src/features/threads/thread-page.test.tsx`

**Step 1: Write failing thread page gate test**

If assistant is missing workspace/provider/model, composer is hidden and checklist CTA appears.

**Step 2: Run test to verify failure**

Run: `pnpm vitest run src/renderer/src/features/threads/thread-page.test.tsx`  
Expected: FAIL.

**Step 3: Implement assistant sidebar + thread list**

- list assistants
- select assistant -> load threads
- create assistant / create thread actions

**Step 4: Implement readiness checker + CTA links**

Checklist:

- workspace configured
- provider assigned
- provider selected model set

**Step 5: Re-run tests and commit**

Run: `pnpm vitest run src/renderer/src/features/threads/thread-page.test.tsx`  
Expected: PASS

```bash
git add src/renderer/src/features/assistants src/renderer/src/features/threads
git commit -m "feat: add assistant and thread management with setup gating"
```

---

### Task 10: Chat UI streaming with assistant-ui + AI SDK useChat

**Files:**

- Create: `src/renderer/src/features/chat/use-thread-chat.ts`
- Create: `src/renderer/src/features/chat/thread-chat.tsx`
- Create: `src/renderer/src/features/chat/message-part-renderer.tsx`
- Modify: `src/renderer/src/features/threads/pages/thread-page.tsx`
- Test: `src/renderer/src/features/chat/message-part-renderer.test.tsx`
- Test: `src/renderer/src/features/chat/use-thread-chat.test.ts`

**Step 1: Write failing part-renderer tests**

Assertions:

- text part renders bubble
- reasoning part renders collapsible block
- tool parts render expandable card

**Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/renderer/src/features/chat/message-part-renderer.test.tsx`  
Expected: FAIL.

**Step 3: Implement `useChat` transport wrapper**

```ts
useChat({
  transport: new DefaultChatTransport({
    api: `${baseUrl}/chat/${assistantId}`,
    headers: { Authorization: `Bearer ${token}` },
    body: { threadId, profileId }
  })
})
```

**Step 4: Implement assistant-ui based thread chat components**

- message list
- input composer
- stream state indicators
- retry for interrupted stream

**Step 5: Re-run tests and commit**

Run:

```bash
pnpm vitest run src/renderer/src/features/chat/message-part-renderer.test.tsx src/renderer/src/features/chat/use-thread-chat.test.ts
```

Expected: PASS

```bash
git add src/renderer/src/features/chat src/renderer/src/features/threads/pages/thread-page.tsx
git commit -m "feat: add chat streaming UI with reasoning and tool call rendering"
```

---

### Task 11: Verification, lint/typecheck, and app smoke run

**Files:**

- Modify: `README.md`
- Create: `docs/plans/verification/2026-02-28-tia-core-verification.md`

**Step 1: Run full automated verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all PASS.

**Step 2: Run development smoke test**

Run: `pnpm dev`  
Manual checks:

- providers page CRUD
- assistant create/edit
- thread auto-create
- reasoning/tool parts visible in chat

**Step 3: Capture verification evidence**

Document command outputs and manual checks in:

`docs/plans/verification/2026-02-28-tia-core-verification.md`

**Step 4: Update README quickstart**

Add:

- env/setup notes
- localhost server auth model
- where DB file lives

**Step 5: Commit**

```bash
git add README.md docs/plans/verification/2026-02-28-tia-core-verification.md
git commit -m "docs: add verification evidence and local runbook"
```
