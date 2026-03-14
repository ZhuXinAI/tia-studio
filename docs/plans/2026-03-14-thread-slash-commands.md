# Thread Slash Commands Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add assistant-thread slash commands so `/stop` immediately aborts the in-flight local chat run without invoking the model and `/new` archives the current thread into the assistant workspace, updates `MEMORY.md`, clears the thread memory, and starts a fresh thread.

**Architecture:** Keep slash-command parsing in the renderer thread controller so commands never reach the chat transport by accident. Back `/new` with a dedicated assistant-runtime command path that reads persisted thread messages from Mastra memory, summarizes them with the same configured provider/model, writes a workspace-local archive markdown file plus a `MEMORY.md` reference, and deletes the thread memory before the renderer creates and selects a new thread.

**Tech Stack:** Electron, React, TypeScript, Hono, Mastra memory storage, AI SDK, Vitest, Node filesystem APIs.

---

## Assumptions

- `/stop` applies to the assistant thread page in this pass. It mirrors the existing stop button behavior.
- `/new` applies to assistant threads, not team threads.
- `/new` should feel like "archive this conversation and start fresh", so the renderer should create/select a fresh thread after successful compaction instead of keeping the emptied thread selected.
- The archive file should live at the assistant workspace root and be named `thread_history_YYYY-MM-DD.md`. If multiple compactions happen on the same day, append `-2`, `-3`, and so on.

### Task 1: Define backend compaction behavior with focused failing tests

**Files:**
- Modify: `src/main/mastra/assistant-runtime.test.ts`
- Modify: `src/main/server/routes/chat-route.test.ts`

**Step 1: Write the failing runtime test**

Add a test that seeds:

- an assistant with a workspace root
- a configured provider/model
- a thread owned by the assistant
- persisted Mastra memory messages for that thread
- existing `MEMORY.md`

Assert that `compactThreadMemory(...)`:

- reads the persisted user/assistant thread messages
- summarizes them through the configured provider
- writes a `thread_history_YYYY-MM-DD.md` file in the workspace root
- appends a note to `MEMORY.md` containing the compacted thread title and date
- deletes the thread memory from storage

**Step 2: Write the failing route test**

Add a route test for `POST /chat/:assistantId/commands` with a body like:

```json
{
  "command": "new",
  "threadId": "thread-1",
  "profileId": "profile-1"
}
```

Assert that the route calls the runtime with `assistantId`, `threadId`, and `profileId`, and returns a structured JSON result.

**Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/main/mastra/assistant-runtime.test.ts src/main/server/routes/chat-route.test.ts`

Expected: FAIL because compaction support and the new route do not exist.

**Step 4: Commit**

```bash
git add src/main/mastra/assistant-runtime.test.ts src/main/server/routes/chat-route.test.ts
git commit -m "test: define thread slash command compaction behavior"
```

---

### Task 2: Implement assistant-runtime compaction support for `/new`

**Files:**
- Modify: `src/main/mastra/assistant-runtime.ts`

**Step 1: Add runtime surface**

Extend `AssistantRuntime` with a new method:

```ts
compactThreadMemory(params: {
  assistantId: string
  threadId: string
  profileId: string
}): Promise<{
  archiveFileName: string
  archiveFilePath: string
  threadTitle: string
  compactedAt: string
}>
```

**Step 2: Implement transcript collection and summary generation**

Implementation requirements:

- Validate assistant, provider, thread ownership, and profile ownership.
- Require an assistant workspace root and throw a `ChatRouteError` if it is missing.
- Load persisted thread messages from the Mastra memory store for the exact `threadId` + `profileId`.
- Convert those messages into a plain-text transcript suitable for summarization.
- Generate the archive summary with the same resolved provider/model using `generateText(...)`.
- Reuse `buildProviderOptions(...)` so `openai-response` still sets `store: false`.

**Step 3: Implement archive file + `MEMORY.md` updates**

Archive file requirements:

- write to the assistant workspace root
- use `thread_history_YYYY-MM-DD.md`
- if the file name already exists, suffix with `-2`, `-3`, etc.
- include metadata header, original thread title, compacted timestamp, and both:
  - a concise model-generated summary
  - the cleaned transcript snapshot that is being compacted

`MEMORY.md` update requirements:

- ensure workspace files exist first
- append a short line like:

```md
- User compacted thread memory of "Investigate webhook bug" on 2026-03-14. See [thread_history_2026-03-14.md](./thread_history_2026-03-14.md).
```

**Step 4: Delete thread memory**

After successfully writing both files, delete the persisted thread memory via the Mastra memory store.

Do not delete the app thread record here; the renderer will create the fresh thread after the command succeeds.

**Step 5: Run focused tests**

Run: `pnpm vitest run src/main/mastra/assistant-runtime.test.ts src/main/server/routes/chat-route.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add src/main/mastra/assistant-runtime.ts src/main/mastra/assistant-runtime.test.ts src/main/server/routes/chat-route.test.ts
git commit -m "feat: add assistant thread compaction runtime"
```

---

### Task 3: Add the assistant-thread command route

**Files:**
- Modify: `src/main/server/routes/chat-route.ts`
- Modify: `src/main/server/routes/chat-route.test.ts`

**Step 1: Add command schema + endpoint**

Create a route:

```ts
app.post('/chat/:assistantId/commands', ...)
```

For this pass, support:

- `command: 'new'`

The route should call `assistantRuntime.compactThreadMemory(...)` and return JSON like:

```json
{
  "ok": true,
  "command": "new",
  "archiveFileName": "thread_history_2026-03-14.md",
  "archiveFilePath": "/abs/workspace/thread_history_2026-03-14.md",
  "threadTitle": "Investigate webhook bug",
  "compactedAt": "2026-03-14T10:20:30.000Z"
}
```

**Step 2: Preserve existing chat error handling**

Map `ChatRouteError` to structured JSON exactly like the other chat endpoints.

**Step 3: Run focused tests**

Run: `pnpm vitest run src/main/server/routes/chat-route.test.ts`

Expected: PASS

**Step 4: Commit**

```bash
git add src/main/server/routes/chat-route.ts src/main/server/routes/chat-route.test.ts
git commit -m "feat: add assistant thread command route"
```

---

### Task 4: Intercept slash commands in the thread renderer

**Files:**
- Modify: `src/renderer/src/features/threads/chat-query.ts`
- Modify: `src/renderer/src/features/threads/hooks/use-thread-page-controller.ts`
- Modify: `src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`

**Step 1: Add a small command client helper**

In `chat-query.ts`, add a typed helper:

```ts
runThreadCommand({
  assistantId,
  threadId,
  profileId,
  command: 'new'
})
```

that posts to `/chat/:assistantId/commands`.

**Step 2: Add slash-command parsing in the thread controller**

Behavior:

- `/stop`
  - if a response is streaming, call `stop()`
  - do not call `sendMessage`
  - do not invoke the backend command route
- `/new`
  - require `selectedAssistant` and `selectedThread`
  - if a response is streaming, stop it first
  - call `runThreadCommand(...)`
  - create a new thread with the existing helper
  - navigate to the new thread
  - do not send the slash command to the LLM

**Step 3: Add focused renderer tests**

Cover:

- `/stop` during streaming calls `stop` and does not call `sendMessage`
- `/new` calls the backend command helper and then creates/selects a new thread
- unknown slash commands still fall back to normal message sending for now

**Step 4: Run focused tests**

Run: `pnpm vitest run src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/threads/chat-query.ts src/renderer/src/features/threads/hooks/use-thread-page-controller.ts src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx
git commit -m "feat: add assistant thread slash commands"
```

---

### Task 5: Verify the end-to-end slice

**Files:**
- Modify if needed based on failures

**Step 1: Run the targeted suites**

Run:

```bash
pnpm vitest run src/main/server/routes/chat-route.test.ts src/main/mastra/assistant-runtime.test.ts src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx
```

Expected: PASS

**Step 2: Run typecheck if the targeted suites pass**

Run:

```bash
pnpm typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add thread slash command support"
```
