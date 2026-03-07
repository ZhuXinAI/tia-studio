# OpenAI Responses `store: false` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Disable OpenAI Responses storage for `openai-response` executions so second-turn requests do not emit `item_reference` payloads.

**Architecture:** Detect the `openai-response` provider at runtime and pass `providerOptions.openai.store = false` into Mastra execution calls. Keep all other providers and persistence flows unchanged.

**Tech Stack:** TypeScript, Vitest, Mastra, AI SDK

---

### Task 1: Add assistant runtime regression coverage

**Files:**
- Modify: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing test**

- Add a test that builds an `openai-response` provider and asserts `handleChatStream` receives `params.providerOptions.openai.store === false`.

**Step 2: Run test to verify it fails**

- Run: `pnpm vitest run src/main/mastra/assistant-runtime.test.ts -t "disables OpenAI Responses storage for openai-response providers"`

**Step 3: Write minimal implementation**

- Update assistant runtime execution params to include `providerOptions.openai.store = false` when provider type is `openai-response`.

**Step 4: Run test to verify it passes**

- Re-run the focused assistant runtime test command.

### Task 2: Add team runtime regression coverage

**Files:**
- Modify: `src/main/mastra/team-runtime.test.ts`

**Step 1: Write the failing test**

- Add a test that uses an `openai-response` supervisor provider and asserts the supervisor `stream()` options include `providerOptions.openai.store === false`.

**Step 2: Run test to verify it fails**

- Run: `pnpm vitest run src/main/mastra/team-runtime.test.ts -t "disables OpenAI Responses storage for openai-response supervisors"`

**Step 3: Write minimal implementation**

- Update team runtime supervisor execution options to include `providerOptions.openai.store = false` when the supervisor provider type is `openai-response`.

**Step 4: Run test to verify it passes**

- Re-run the focused team runtime test command.

### Task 3: Verify the full targeted runtime suite

**Files:**
- Modify: `src/main/mastra/assistant-runtime.ts`
- Modify: `src/main/mastra/team-runtime.ts`

**Step 1: Run focused verification**

- Run: `pnpm vitest run src/main/mastra/assistant-runtime.test.ts src/main/mastra/team-runtime.test.ts`

**Step 2: Confirm unaffected behavior**

- Ensure existing runtime tests still pass and no non-`openai-response` behavior changes are required.

**Step 3: Skip commit unless requested**

- Do not create a git commit in this session unless the user asks for it.
