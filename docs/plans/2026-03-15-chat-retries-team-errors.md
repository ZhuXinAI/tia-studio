# Chat Retries And Team Error Surfacing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bounded model retries for chat/team runs and surface concise delegated-model errors in the Team UI.

**Architecture:** Pass explicit `maxRetries` model settings into the existing Mastra/AI SDK stream entry points so provider calls retry before failing. Update the shared thread/team message list so team delegation tool failures render a short error state instead of an indefinite "Working..." block.

**Tech Stack:** Electron, React, TypeScript, Mastra, AI SDK, Vitest

---

### Task 1: Wire retry settings into runtime model calls

**Files:**

- Modify: `src/main/mastra/assistant-runtime.ts`
- Modify: `src/main/mastra/team-runtime.ts`
- Test: `src/main/mastra/assistant-runtime.test.ts`
- Test: `src/main/mastra/team-runtime.test.ts`

**Step 1: Write/adjust failing tests**

Add assertions that assistant chat and team supervisor/member executions pass `modelSettings.maxRetries = 2`.

**Step 2: Run targeted tests to confirm current failure**

Run:

```bash
pnpm vitest run src/main/mastra/assistant-runtime.test.ts src/main/mastra/team-runtime.test.ts
```

Expected: new retry assertions fail before implementation.

**Step 3: Implement minimal runtime changes**

Add a shared retry constant and pass `modelSettings: { maxRetries: 2 }` to `handleChatStream`, `Agent.stream`, and thread compaction summary generation where model calls are created.

**Step 4: Re-run targeted tests**

Run:

```bash
pnpm vitest run src/main/mastra/assistant-runtime.test.ts src/main/mastra/team-runtime.test.ts
```

Expected: retry assertions pass.

### Task 2: Surface concise Team delegation failures

**Files:**

- Modify: `src/renderer/src/features/threads/components/thread-chat-message-list.tsx`
- Modify: `src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx`

**Step 1: Write/adjust failing test**

Add a team-mode rendering test where a delegated tool part is incomplete with an error and assert the UI shows the truncated message instead of only a running state.

**Step 2: Run targeted renderer test**

Run:

```bash
pnpm vitest run src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx
```

Expected: the new failure-rendering assertion fails before implementation.

**Step 3: Implement minimal renderer change**

Extend team visible block extraction to capture incomplete tool errors, mark the block as errored, and render the plain error message truncated to 50 characters.

**Step 4: Re-run targeted renderer test**

Run:

```bash
pnpm vitest run src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx
```

Expected: the team error assertion passes and existing delegation rendering still passes.

### Task 3: Final verification

**Files:**

- Modify: none

**Step 1: Run focused suite**

Run:

```bash
pnpm vitest run src/main/mastra/assistant-runtime.test.ts src/main/mastra/team-runtime.test.ts src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx
```

Expected: all targeted tests pass.

**Step 2: Review diff**

Run:

```bash
git diff -- src/main/mastra/assistant-runtime.ts src/main/mastra/team-runtime.ts src/main/mastra/assistant-runtime.test.ts src/main/mastra/team-runtime.test.ts src/renderer/src/features/threads/components/thread-chat-message-list.tsx src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx
```

Expected: diff only contains retry wiring, team error rendering, and matching tests.
