# Assistant Cron Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add assistant-facing tools to create, list, and remove the current assistant’s cron jobs while preserving hidden-thread scheduling and no-memory cron execution.

**Architecture:** Extract cron lifecycle rules into a shared service in `src/main/cron`, reuse that service from both the HTTP cron route and Mastra tool layer, and wire assistant-local cron tools into `AssistantRuntimeService` only when the assistant has a workspace root. Keep cron execution unchanged so scheduled runs still skip Mastra memory persistence and write work logs.

**Tech Stack:** TypeScript, Vitest, Hono, Mastra tools, LibSQL repositories

---

### Task 1: Add failing tests for cron tools and service

**Files:**
- Create: `src/main/mastra/tools/cron-tools.test.ts`
- Create: `src/main/cron/assistant-cron-jobs-service.test.ts`
- Modify: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing test**

Add tests that prove:

- `createCronTools(...)` creates a cron job for the current assistant only
- `listCronJobs(...)` returns only jobs owned by the current assistant
- `removeCronJob(...)` refuses to remove jobs owned by another assistant
- `AssistantRuntimeService` registers `createCronJob`, `listCronJobs`, and `removeCronJob` for assistants with workspaces
- the shared cron service creates/deletes hidden threads and reloads the scheduler

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/mastra/tools/cron-tools.test.ts src/main/cron/assistant-cron-jobs-service.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: FAIL because the cron tool file and shared service do not exist yet, and runtime registration does not include the new tools.

**Step 3: Write minimal implementation**

Do not write production code yet beyond the minimum scaffolding needed to satisfy imports after observing the failing assertions.

**Step 4: Run test to verify it passes**

Run the same command again after Tasks 2 and 3 complete.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/mastra/tools/cron-tools.test.ts src/main/cron/assistant-cron-jobs-service.test.ts src/main/mastra/assistant-runtime.test.ts
git commit -m "test: cover assistant cron tools"
```

### Task 2: Implement shared cron job management service

**Files:**
- Create: `src/main/cron/assistant-cron-jobs-service.ts`
- Modify: `src/main/server/routes/cron-jobs-route.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/index.ts`
- Test: `src/main/cron/assistant-cron-jobs-service.test.ts`
- Test: `src/main/server/routes/cron-jobs-route.test.ts`

**Step 1: Write the failing test**

Extend or add tests proving the service:

- validates assistant existence and workspace root
- creates hidden cron threads on create
- rotates hidden threads on assistant change
- deletes hidden threads on delete
- reloads the scheduler after create/update/delete

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/cron/assistant-cron-jobs-service.test.ts src/main/server/routes/cron-jobs-route.test.ts`

Expected: FAIL with missing service behavior or mismatched assertions.

**Step 3: Write minimal implementation**

Implement a focused service API such as:

- `listAllCronJobs()`
- `listAssistantCronJobs(assistantId)`
- `createCronJob(...)`
- `updateCronJob(...)`
- `removeCronJob(...)`
- `removeAssistantCronJob(assistantId, cronJobId)`

Refactor the route to delegate lifecycle work to the service instead of manipulating threads and scheduler state directly.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/cron/assistant-cron-jobs-service.test.ts src/main/server/routes/cron-jobs-route.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/cron/assistant-cron-jobs-service.ts src/main/server/routes/cron-jobs-route.ts src/main/server/create-app.ts src/main/index.ts src/main/cron/assistant-cron-jobs-service.test.ts src/main/server/routes/cron-jobs-route.test.ts
git commit -m "feat: share assistant cron job lifecycle"
```

### Task 3: Add Mastra cron tools and runtime wiring

**Files:**
- Create: `src/main/mastra/tools/cron-tools.ts`
- Modify: `src/main/mastra/assistant-runtime.ts`
- Test: `src/main/mastra/tools/cron-tools.test.ts`
- Test: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing test**

Add assertions that:

- runtime tool registration includes `createCronJob`, `listCronJobs`, `removeCronJob`
- tool execution calls the shared service with the current assistant ID
- deletion fails cleanly for a cron job owned by a different assistant

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/mastra/tools/cron-tools.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: FAIL because the tools are not wired into the runtime yet.

**Step 3: Write minimal implementation**

Create a cron tools factory mirroring the local tool style:

- kebab-case Mastra tool ids
- camelCase tool map keys
- current assistant ID captured in factory options

Register those tools only when both the workspace root and cron service are available.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/mastra/tools/cron-tools.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/mastra/tools/cron-tools.ts src/main/mastra/assistant-runtime.ts src/main/mastra/tools/cron-tools.test.ts src/main/mastra/assistant-runtime.test.ts
git commit -m "feat: add assistant cron tools"
```

### Task 4: Verify end-to-end cron behavior stays intact

**Files:**
- Modify: `src/main/mastra/assistant-runtime.test.ts`
- Modify: `src/main/server/routes/cron-jobs-route.test.ts`
- Test: `src/main/cron/cron-scheduler-service.test.ts`

**Step 1: Write the failing test**

Confirm existing cron execution behavior still holds:

- cron runs inject heartbeat request context
- cron runs omit Mastra memory persistence
- scheduler still writes work-log entries from cron output

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/mastra/assistant-runtime.test.ts src/main/cron/cron-scheduler-service.test.ts src/main/server/routes/cron-jobs-route.test.ts`

Expected: FAIL if any wiring regression changed cron execution semantics.

**Step 3: Write minimal implementation**

Adjust only the wiring needed to keep the previous behavior green. Do not refactor cron execution itself unless the tests prove it is necessary.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/mastra/tools/cron-tools.test.ts src/main/cron/assistant-cron-jobs-service.test.ts src/main/mastra/assistant-runtime.test.ts src/main/server/routes/cron-jobs-route.test.ts src/main/cron/cron-scheduler-service.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime.test.ts src/main/server/routes/cron-jobs-route.test.ts src/main/cron/cron-scheduler-service.test.ts
git commit -m "test: verify cron execution behavior"
```
