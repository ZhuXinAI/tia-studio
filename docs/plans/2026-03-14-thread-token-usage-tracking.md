# Thread Token Usage Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist durable token usage for assistant-thread conversations at both the per-message and per-thread levels, replacing the current transient `message.metadata.usage` stopgap as the source of truth.

**Architecture:** Keep normalized usage records in `tia-studio.db` and treat Mastra message IDs from `mastra.db` as the logical bridge. Record usage once per persisted assistant message with idempotent upserts, maintain thread totals separately for fast reads, and enrich chat history responses from the normalized tables so the renderer no longer depends on stream-time metadata hacks.

**Tech Stack:** Electron, TypeScript, LibSQL/SQLite, Mastra memory storage, AI SDK UI streams, Hono, Vitest.

---

## Execution rules

- Apply **TDD** per task (red -> green -> refactor).
- Keep commits small and frequent.
- Prefer focused tests before the full suite.
- Do not double-count usage by attaching the same cost to both the user message and the assistant message.

## Domain rules

- Treat LLM cost as belonging to the **assistant response message** that was generated.
- User messages may have `usage: null` or no usage field at all.
- Thread totals are the sum of assistant-message usage rows for that thread.
- Persist the richer AI SDK fields now: `inputTokens`, `outputTokens`, `totalTokens`, `reasoningTokens`, `cachedInputTokens`, `finishReason`, `provider/model`, and raw usage JSON.
- Do not use `app_threads.metadata` as the canonical usage store anymore.

## Data model recommendation

Create two app-level tables in `tia-studio.db`:

1. `app_thread_message_usage`
   - One row per assistant message that incurred model usage.
   - Key columns:
     - `message_id TEXT PRIMARY KEY`
     - `thread_id TEXT NOT NULL`
     - `assistant_id TEXT NOT NULL`
     - `resource_id TEXT NOT NULL`
     - `provider_id TEXT`
     - `model TEXT`
     - `input_tokens INTEGER NOT NULL DEFAULT 0`
     - `output_tokens INTEGER NOT NULL DEFAULT 0`
     - `total_tokens INTEGER NOT NULL DEFAULT 0`
     - `reasoning_tokens INTEGER NOT NULL DEFAULT 0`
     - `cached_input_tokens INTEGER NOT NULL DEFAULT 0`
     - `step_count INTEGER NOT NULL DEFAULT 0`
     - `finish_reason TEXT`
     - `source TEXT NOT NULL`
     - `raw_usage_json TEXT NOT NULL DEFAULT '{}'`
     - `created_at TEXT NOT NULL`
     - `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

2. `app_thread_usage_totals`
   - One row per app thread for fast summary reads.
   - Key columns:
     - `thread_id TEXT PRIMARY KEY`
     - `assistant_message_count INTEGER NOT NULL DEFAULT 0`
     - `input_tokens_total INTEGER NOT NULL DEFAULT 0`
     - `output_tokens_total INTEGER NOT NULL DEFAULT 0`
     - `total_tokens_total INTEGER NOT NULL DEFAULT 0`
     - `reasoning_tokens_total INTEGER NOT NULL DEFAULT 0`
     - `cached_input_tokens_total INTEGER NOT NULL DEFAULT 0`
     - `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

This keeps thread totals queryable without parsing Mastra JSON blobs and avoids depending on cross-database SQL joins.

---

### Task 1: Add normalized usage persistence tables and repository

**Files:**

- Modify: `src/main/persistence/migrations/0001_app_core.ts`
- Modify: `src/main/persistence/migrations/0001_app_core.sql`
- Modify: `src/main/persistence/migrate.ts`
- Create: `src/main/persistence/repos/thread-usage-repo.ts`
- Test: `src/main/persistence/repos/thread-usage-repo.test.ts`

**Step 1: Write the failing repository test**

Create tests that prove:

- `recordMessageUsage()` inserts a new message-usage row and creates totals.
- Re-recording the same `message_id` replaces the row without double-counting totals.
- `listByMessageIds()` returns usage keyed by message ID.
- `getThreadTotals()` returns `null` for empty threads and a totals object for populated ones.

Use cases to cover:

```ts
await repo.recordMessageUsage({
  messageId: 'msg-1',
  threadId: thread.id,
  assistantId: assistant.id,
  resourceId: 'profile-1',
  providerId: provider.id,
  model: 'gpt-5',
  source: 'chat',
  usage: {
    inputTokens: 120,
    outputTokens: 40,
    totalTokens: 160,
    reasoningTokens: 12,
    cachedInputTokens: 30
  },
  stepCount: 2,
  finishReason: 'stop',
  createdAt: '2026-03-14T00:00:00.000Z'
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/persistence/repos/thread-usage-repo.test.ts`

Expected: FAIL because the repository and tables do not exist.

**Step 3: Write minimal implementation**

Implement `ThreadUsageRepository` with methods:

- `recordMessageUsage(...)`
- `listByMessageIds(messageIds: string[])`
- `getThreadTotals(threadId: string)`

Implementation requirements:

- Upsert by `message_id`.
- Read the prior row first and apply a delta to `app_thread_usage_totals`.
- Use a single transaction/batch so row + totals stay consistent.
- Add indexes on `thread_id` and `assistant_id`.

Add migration helpers in `migrate.ts` and keep `0001_app_core.ts` / `.sql` in sync for fresh installs.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/main/persistence/repos/thread-usage-repo.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/persistence/migrations/0001_app_core.ts src/main/persistence/migrations/0001_app_core.sql src/main/persistence/migrate.ts src/main/persistence/repos/thread-usage-repo.ts src/main/persistence/repos/thread-usage-repo.test.ts
git commit -m "feat: add normalized thread token usage storage"
```

---

### Task 2: Backfill old metadata-based usage into normalized tables

**Files:**

- Create: `src/main/persistence/thread-usage-backfill.ts`
- Test: `src/main/persistence/thread-usage-backfill.test.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing backfill test**

Create a test that seeds:

- An app thread in `tia-studio.db`
- A Mastra message in `mastra.db` with usage inside its stored content metadata

Example stored content shape to backfill:

```json
{
  "parts": [{ "type": "text", "text": "Final answer" }],
  "metadata": {
    "usage": {
      "inputTokens": 100,
      "outputTokens": 25,
      "totalTokens": 125
    }
  }
}
```

Assert that the backfill:

- Creates `app_thread_message_usage`
- Updates `app_thread_usage_totals`
- Is idempotent when run twice

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/persistence/thread-usage-backfill.test.ts`

Expected: FAIL because the backfill function does not exist.

**Step 3: Write minimal implementation**

Implement a one-time backfill helper that:

- Reads `mastra_messages` rows from `mastra.db`
- Parses `content`
- Extracts `content.metadata.usage`
- Resolves the corresponding app thread via `thread_id`
- Calls `ThreadUsageRepository.recordMessageUsage(...)`
- Stores a completion flag in `app_preferences`, for example `thread_usage_backfill_v1`

Wire the helper into startup in `src/main/index.ts` after both DBs are available:

```ts
await runThreadUsageBackfill({
  appDb: db,
  mastraDbPath: join(app.getPath('userData'), 'mastra.db'),
  usageRepo
})
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/main/persistence/thread-usage-backfill.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/persistence/thread-usage-backfill.ts src/main/persistence/thread-usage-backfill.test.ts src/main/index.ts
git commit -m "feat: backfill legacy message usage into normalized tables"
```

---

### Task 3: Persist usage from all assistant-thread runtime flows

**Files:**

- Modify: `src/main/mastra/assistant-runtime.ts`
- Modify: `src/main/index.ts`
- Test: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing runtime tests**

Add tests that prove usage is recorded for:

- `streamChat(...)`
- `runCronJob(...)`
- `runHeartbeat(...)`

Cover these details:

- Capture `start.messageId` when present.
- Capture `finish-step.usage` to derive `stepCount`.
- Capture `finish.totalUsage`.
- Capture `finish.finishReason`.
- Fall back safely if `start.messageId` is absent.
- Do not write usage on aborted or errored streams.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/mastra/assistant-runtime.test.ts`

Expected: FAIL because the runtime does not persist usage.

**Step 3: Write minimal implementation**

Extend `AssistantRuntimeServiceOptions` with:

```ts
threadUsageRepo?: {
  recordMessageUsage(input: {
    messageId: string
    threadId: string
    assistantId: string
    resourceId: string
    providerId: string
    model: string
    source: 'chat' | 'cron' | 'heartbeat'
    usage: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      reasoningTokens?: number
      cachedInputTokens?: number
    }
    stepCount: number
    finishReason?: string
    createdAt: string
  }): Promise<void>
}
```

Refactor stream handling so there is one shared observer for all thread-producing flows.

Recommended pattern:

- In `streamWithThreadTitleSync`, record:
  - `assistantMessageId` from `start.messageId`
  - `stepCount` from `finish-step`
  - final usage from `finish.totalUsage`
- Replace `collectStreamText()` with a collector that also records usage.
- Persist usage before the stream is considered fully synced.

Wire the repository in `src/main/index.ts` when creating `AssistantRuntimeService`.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/main/mastra/assistant-runtime.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime.ts src/main/index.ts src/main/mastra/assistant-runtime.test.ts
git commit -m "feat: persist assistant thread usage from runtime streams"
```

---

### Task 4: Serve usage from the normalized store on read paths

**Files:**

- Modify: `src/main/mastra/assistant-runtime.ts`
- Modify: `src/main/server/routes/threads-route.ts`
- Modify: `src/main/server/create-app.ts`
- Test: `src/main/server/routes/threads-route.test.ts`
- Test: `src/main/server/routes/chat-route.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:

- `GET /chat/:assistantId/history` returns assistant messages with usage enriched from `ThreadUsageRepository`, even if the usage is no longer stored in message metadata.
- `GET /v1/threads` returns thread totals in each thread response.

Expected thread response shape:

```ts
{
  id: 'thread-1',
  title: 'Thread one',
  usageTotals: {
    assistantMessageCount: 3,
    inputTokens: 1000,
    outputTokens: 320,
    totalTokens: 1320,
    reasoningTokens: 90,
    cachedInputTokens: 210
  }
}
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/main/server/routes/chat-route.test.ts src/main/server/routes/threads-route.test.ts`

Expected: FAIL because history and thread list do not use the repository.

**Step 3: Write minimal implementation**

In `AssistantRuntimeService.listThreadMessages(...)`:

- Load Mastra messages as before.
- Collect their message IDs.
- Load usage rows from `ThreadUsageRepository.listByMessageIds(...)`.
- Merge usage back into returned UI messages, for backward compatibility via:

```ts
metadata: {
  ...(message.metadata ?? {}),
  usage: {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cachedInputTokens
  }
}
```

In `threads-route.ts`:

- Accept a `threadUsageRepo` dependency.
- Load totals for listed threads and attach `usageTotals`.

In `create-app.ts` and `index.ts`:

- Thread the new repository through the server wiring.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/main/server/routes/chat-route.test.ts src/main/server/routes/threads-route.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime.ts src/main/server/routes/threads-route.ts src/main/server/create-app.ts src/main/server/routes/threads-route.test.ts src/main/server/routes/chat-route.test.ts src/main/index.ts
git commit -m "feat: expose persisted thread usage on history and thread APIs"
```

---

### Task 5: Switch the renderer to DB-backed usage state

**Files:**

- Modify: `src/renderer/src/features/threads/threads-query.ts`
- Modify: `src/renderer/src/features/threads/hooks/use-thread-page-controller.ts`
- Modify: `src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`
- Modify: `src/renderer/src/features/threads/chat-query.test.ts`
- Optional Modify: `src/renderer/src/features/threads/components/thread-chat-card.tsx`

**Step 1: Write the failing renderer tests**

Add tests that prove:

- Loaded thread records carry `usageTotals`.
- The controller restores usage from server data when switching threads or reloading history.
- The controller does not depend on the just-finished streamed message to know the thread’s usage.

If you decide to rename the header chip to clarify semantics, add a rendering assertion for the new label.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx src/renderer/src/features/threads/chat-query.test.ts`

Expected: FAIL because the renderer types and controller logic do not use `usageTotals`.

**Step 3: Write minimal implementation**

Update `ThreadRecord`:

```ts
usageTotals?: {
  assistantMessageCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedInputTokens: number
} | null
```

Update the controller so the canonical usage state comes from `selectedThread.usageTotals`.

Recommended approach:

- Keep a short-lived optimistic state while a response is still streaming if needed.
- Reconcile to server totals after history or thread-list refresh.
- Stop treating `message.metadata.usage` from `onFinish` as the only source of truth.

If you keep the header chip:

- Either show thread totals explicitly
- Or rename it so the UI is honest about what it represents

**Step 4: Run tests and typecheck**

Run: `pnpm vitest run src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx src/renderer/src/features/threads/chat-query.test.ts`

Expected: PASS

Run: `pnpm typecheck`

Expected: Exit 0

**Step 5: Commit**

```bash
git add src/renderer/src/features/threads/threads-query.ts src/renderer/src/features/threads/hooks/use-thread-page-controller.ts src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx src/renderer/src/features/threads/chat-query.test.ts src/renderer/src/features/threads/components/thread-chat-card.tsx
git commit -m "feat: use persisted thread token usage in the renderer"
```

---

### Task 6: Run regression coverage

**Files:**

- No code changes required unless regressions appear.

**Step 1: Run focused suites**

Run:

```bash
pnpm vitest run src/main/persistence/repos/thread-usage-repo.test.ts src/main/persistence/thread-usage-backfill.test.ts src/main/mastra/assistant-runtime.test.ts src/main/server/routes/chat-route.test.ts src/main/server/routes/threads-route.test.ts src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx src/renderer/src/features/threads/chat-query.test.ts
```

Expected: PASS

**Step 2: Run broader verification**

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: Exit 0

**Step 3: Commit**

```bash
git add .
git commit -m "test: verify thread token usage tracking end to end"
```

---

## Notes for the implementer

- The current stopgap lives in `src/main/mastra/assistant-runtime.ts` where `finish.totalUsage` is copied into `messageMetadata`, and in `src/renderer/src/features/threads/hooks/use-thread-page-controller.ts` where `onFinish` reads `message.metadata.usage`. That path should become compatibility glue, not the canonical persistence layer.
- Because `tia-studio.db` and `mastra.db` are separate files today, do not try to build SQL foreign keys across them. Use `message_id` + `thread_id` as application-level links.
- If `start.messageId` is ever missing, add a guarded fallback lookup for the newest assistant message in the thread after stream completion rather than dropping usage entirely.
- If you later need “cost per turn” instead of “cost per assistant message”, add a separate `app_thread_turn_usage` table keyed by the final assistant message and optionally linked to the triggering user message. Do not overload `app_thread_message_usage` for both jobs.

Plan complete and saved to `docs/plans/2026-03-14-thread-token-usage-tracking.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
