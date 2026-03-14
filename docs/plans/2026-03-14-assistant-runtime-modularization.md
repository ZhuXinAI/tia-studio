# Assistant Runtime Modularization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Break `src/main/mastra/assistant-runtime.ts` into a focused `src/main/mastra/assistant-runtime/` folder without changing the public `AssistantRuntimeService` behavior or import path.

**Architecture:** Keep `AssistantRuntimeService` as the orchestration entry point, but extract pure helpers and tightly scoped collaborators into `src/main/mastra/assistant-runtime/`. Use the existing `AssistantRuntimeService` test suite as the main characterization harness, add a few focused unit tests for newly extracted helpers, and only switch the public import from the single file to `index.ts` after the folder modules are already in use internally.

**Tech Stack:** TypeScript, Vitest, Mastra, AI SDK, Electron main-process services

---

### Task 1: Create the folder scaffold and extract shared instructions/types

**Files:**

- Create: `src/main/mastra/assistant-runtime/types.ts`
- Create: `src/main/mastra/assistant-runtime/instructions.ts`
- Create: `src/main/mastra/assistant-runtime/instructions.test.ts`
- Modify: `src/main/mastra/assistant-runtime.ts`
- Test: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing test**

Add a new `instructions.test.ts` that proves a shared helper can compose:

- the onboarding block
- the shared web-fetch block
- the built-in-browser block
- the channel-delivery block

Use a signature like:

```ts
import { buildAssistantInstructions } from './instructions'

it('adds onboarding, browser, and channel guidance when enabled', () => {
  const text = buildAssistantInstructions({
    baseInstructions: 'You are helpful.',
    currentDateTime: 'Friday, March 14, 2026, 10:00:00 AM CST',
    isFirstConversation: true,
    channelDeliveryEnabled: true,
    channelType: 'lark',
    builtInBrowserHandoffAvailable: true
  })

  expect(text).toContain('First Conversation Onboarding')
  expect(text).toContain('Use webFetch only when you already know the exact page URL')
  expect(text).toContain('TIA provides a built-in Electron browser')
  expect(text).toContain('insert [[BR]]')
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/mastra/assistant-runtime/instructions.test.ts`

Expected: FAIL because the folder helper file does not exist yet.

**Step 3: Write minimal implementation**

Move these definitions out of `assistant-runtime.ts`:

- `StreamChatParams`, `ListThreadMessagesParams`, `RunCronJobParams`, `RunHeartbeatParams`, `ThreadCommandResult`
- `CHANNEL_BREAK_TAG`, `CHANNEL_SPLITTER_INSTRUCTION`, `WECHAT_KF_CHANNEL_TYPE`
- `ONBOARDING_INSTRUCTIONS`
- `WEB_FETCH_INSTRUCTIONS`

Create a helper like:

```ts
export function buildAssistantInstructions(input: {
  baseInstructions: string
  currentDateTime: string
  isFirstConversation: boolean
  channelDeliveryEnabled: boolean
  channelType?: string
  builtInBrowserHandoffAvailable: boolean
}): string
```

Update `AssistantRuntimeService.ensureAgentRegistered(...)` to call that helper instead of concatenating those strings inline.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/mastra/assistant-runtime/instructions.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime/types.ts src/main/mastra/assistant-runtime/instructions.ts src/main/mastra/assistant-runtime/instructions.test.ts src/main/mastra/assistant-runtime.ts src/main/mastra/assistant-runtime.test.ts
git commit -m "refactor: extract assistant runtime instructions"
```

### Task 2: Extract scheduled-run and stream helper logic

**Files:**

- Create: `src/main/mastra/assistant-runtime/scheduled-runs.ts`
- Create: `src/main/mastra/assistant-runtime/scheduled-runs.test.ts`
- Create: `src/main/mastra/assistant-runtime/stream-observation.ts`
- Create: `src/main/mastra/assistant-runtime/stream-observation.test.ts`
- Modify: `src/main/mastra/assistant-runtime.ts`
- Test: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing test**

Add focused tests for:

- `buildScheduledRunMessages(...)`
- `createStreamUsageObservation(...)`
- `observeStreamChunk(...)`
- `normalizeUsageMetrics(...)`

Use signatures like:

```ts
const observation = createStreamUsageObservation()
observeStreamChunk(observation, {
  type: 'finish',
  messageId: 'assistant-msg-1',
  totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
} as never)

expect(observation.assistantMessageId).toBe('assistant-msg-1')
expect(observation.totalUsage?.totalTokens).toBe(3)
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/mastra/assistant-runtime/scheduled-runs.test.ts src/main/mastra/assistant-runtime/stream-observation.test.ts`

Expected: FAIL because the helper modules do not exist yet.

**Step 3: Write minimal implementation**

Extract these methods into folder helpers:

- `buildScheduledRunMessages`
- `collectStreamText`
- `createStreamUsageObservation`
- `observeStreamChunk`
- `normalizeUsageMetrics`
- `normalizeInteger`
- `normalizeTimestamp`

Keep `persistObservedThreadUsage(...)` on the service for now, but have it depend on the extracted helpers.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/mastra/assistant-runtime/scheduled-runs.test.ts src/main/mastra/assistant-runtime/stream-observation.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime/scheduled-runs.ts src/main/mastra/assistant-runtime/scheduled-runs.test.ts src/main/mastra/assistant-runtime/stream-observation.ts src/main/mastra/assistant-runtime/stream-observation.test.ts src/main/mastra/assistant-runtime.ts src/main/mastra/assistant-runtime.test.ts
git commit -m "refactor: extract assistant runtime stream helpers"
```

### Task 3: Extract thread compaction and history-document helpers

**Files:**

- Create: `src/main/mastra/assistant-runtime/thread-compaction.ts`
- Create: `src/main/mastra/assistant-runtime/thread-compaction.test.ts`
- Modify: `src/main/mastra/assistant-runtime.ts`
- Test: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing test**

Add helper-level tests for:

- `buildThreadCompactionTranscript(...)`
- `extractCompactionMessageText(...)`
- `buildThreadHistoryDocument(...)`
- `formatDateToken(...)`

Use examples with mixed `assistant`, `user`, `text`, and `reasoning` parts to prove transcript rendering stays unchanged.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/mastra/assistant-runtime/thread-compaction.test.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

Extract these methods into `thread-compaction.ts`:

- `buildThreadCompactionTranscript`
- `extractCompactionMessageText`
- `buildThreadHistoryDocument`
- `formatDateToken`

Leave the service-owned I/O methods in place for now:

- `compactThreadMemory`
- `resolveThreadCompactionTitle`
- `generateThreadCompactionSummary`
- `appendThreadCompactionMemoryReference`
- `resolveThreadHistoryFileName`

Those service methods should call the extracted pure helpers.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/mastra/assistant-runtime/thread-compaction.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime/thread-compaction.ts src/main/mastra/assistant-runtime/thread-compaction.test.ts src/main/mastra/assistant-runtime.ts src/main/mastra/assistant-runtime.test.ts
git commit -m "refactor: extract assistant runtime thread compaction helpers"
```

### Task 4: Extract MCP and managed-runtime resolution helpers

**Files:**

- Create: `src/main/mastra/assistant-runtime/mcp-runtime.ts`
- Create: `src/main/mastra/assistant-runtime/mcp-runtime.test.ts`
- Modify: `src/main/mastra/assistant-runtime.ts`
- Test: `src/main/mastra/assistant-runtime.runtime-resolution.test.ts`

**Step 1: Write the failing test**

Add tests for a folder helper that resolves:

- `npx` to managed `bunx`
- `uvx` to managed `uvx`
- `bun` to managed `bun`
- runtime-unavailable errors for required managed commands

Use signatures like:

```ts
const definition = await toCommandMcpServerDefinition({
  server: {
    command: 'npx',
    args: ['-y', 'tool'],
    env: {}
  },
  managedRuntimeResolver: { ... }
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/mastra/assistant-runtime/mcp-runtime.test.ts src/main/mastra/assistant-runtime.runtime-resolution.test.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

Move these methods into `mcp-runtime.ts`:

- `toMcpServerDefinitions`
- `toMcpServerDefinition`
- `toCommandMcpServerDefinition`
- `resolveManagedCommand`
- `getRequiredManagedRuntimeKind`
- `isManagedRuntimeReady`
- `toStringMap`

Keep `buildMcpTools(...)` and `disconnectMcpClient(...)` on the service until Task 5, because they still depend on service-owned `assistantMcpClients`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/mastra/assistant-runtime/mcp-runtime.test.ts src/main/mastra/assistant-runtime.runtime-resolution.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime/mcp-runtime.ts src/main/mastra/assistant-runtime/mcp-runtime.test.ts src/main/mastra/assistant-runtime.ts src/main/mastra/assistant-runtime.runtime-resolution.test.ts src/main/mastra/assistant-runtime.test.ts
git commit -m "refactor: extract assistant runtime mcp helpers"
```

### Task 5: Extract workspace and agent-registration composition

**Files:**

- Create: `src/main/mastra/assistant-runtime/workspace-tools.ts`
- Create: `src/main/mastra/assistant-runtime/workspace-tools.test.ts`
- Create: `src/main/mastra/assistant-runtime/agent-registration.ts`
- Create: `src/main/mastra/assistant-runtime/agent-registration.test.ts`
- Modify: `src/main/mastra/assistant-runtime.ts`
- Test: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing test**

Add tests that prove extracted helpers can:

- resolve workspace roots and skill paths
- build the assembled tool map for assistants with workspace, cron, channel, memory, MCP, and built-in-browser support
- compute a stable agent-registration signature from assistant/provider/runtime inputs

Use signatures like:

```ts
const tools = await buildAssistantTools({
  assistantId: 'assistant-1',
  workspaceRootPath: '/tmp/workspace',
  channelDeliveryEnabled: true,
  cronToolsEnabled: true,
  builtInBrowserManager: controller,
  // ...
})

expect(Object.keys(tools)).toEqual(
  expect.arrayContaining(['webFetch', 'requestBrowserHumanHandoff'])
)
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/mastra/assistant-runtime/workspace-tools.test.ts src/main/mastra/assistant-runtime/agent-registration.test.ts`

Expected: FAIL because the helper modules do not exist yet.

**Step 3: Write minimal implementation**

Extract and reuse these responsibilities:

- `buildWorkspace`
- `resolveWorkspaceRootPath`
- `resolveSkillsPaths`
- `resolveEnabledMcpServers`
- `resolveMemoryOptions`
- `toStringList`
- `toBooleanMap`
- `toNonEmptyString`
- `toJsonObject`

Then move the bulk of `ensureAgentRegistered(...)` into an `agent-registration.ts` helper that returns:

```ts
type RegisteredAgentBuild = {
  signature: string
  agent: Agent
}
```

Leave only service-owned state updates in the class:

- signature cache checks
- `mastra.addAgent(...)`
- MCP client disconnect/replacement

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/mastra/assistant-runtime/workspace-tools.test.ts src/main/mastra/assistant-runtime/agent-registration.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime/workspace-tools.ts src/main/mastra/assistant-runtime/workspace-tools.test.ts src/main/mastra/assistant-runtime/agent-registration.ts src/main/mastra/assistant-runtime/agent-registration.test.ts src/main/mastra/assistant-runtime.ts src/main/mastra/assistant-runtime.test.ts
git commit -m "refactor: extract assistant runtime registration helpers"
```

### Task 6: Convert the public module from a single file to a folder index

**Files:**

- Create: `src/main/mastra/assistant-runtime/index.ts`
- Delete: `src/main/mastra/assistant-runtime.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/server/routes/chat-route.ts`
- Modify: `src/main/server/routes/chat-route.test.ts`
- Modify: `src/main/heartbeat/heartbeat-scheduler-service.test.ts`
- Modify: `src/main/cron/cron-scheduler-service.test.ts`
- Modify: `src/main/server/routes/assistant-heartbeat-route.test.ts`
- Modify: any other `src/main/**/*.ts` files that import `./assistant-runtime`

**Step 1: Write the failing test**

Add or update one import-resolution test that proves:

- `import { AssistantRuntimeService } from './assistant-runtime'` still works
- `import type { AssistantRuntime } from './assistant-runtime'` still works

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/mastra/assistant-runtime.runtime-resolution.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: FAIL after the file move but before the new `index.ts` export is in place.

**Step 3: Write minimal implementation**

Move the remaining service implementation into:

```ts
// src/main/mastra/assistant-runtime/index.ts
export type { AssistantRuntime } from './types'
export { AssistantRuntimeService } from './service'
```

If you prefer a separate service file, create:

- `src/main/mastra/assistant-runtime/service.ts`

and let `index.ts` be the stable public surface.

Update internal relative imports to point at the new folder modules, then remove the old `assistant-runtime.ts`.

**Step 4: Run test to verify it passes**

Run: `npm run typecheck:node`

Then run: `npx vitest run src/main/mastra/assistant-runtime.runtime-resolution.test.ts src/main/mastra/assistant-runtime.test.ts src/main/server/routes/chat-route.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime src/main/index.ts src/main/server/create-app.ts src/main/server/routes/chat-route.ts src/main/server/routes/chat-route.test.ts src/main/heartbeat/heartbeat-scheduler-service.test.ts src/main/cron/cron-scheduler-service.test.ts src/main/server/routes/assistant-heartbeat-route.test.ts
git commit -m "refactor: move assistant runtime into a folder module"
```

### Task 7: Run the full regression pass for the refactor

**Files:**

- Modify: `src/main/mastra/assistant-runtime.test.ts`
- Modify: `src/main/mastra/assistant-runtime.runtime-resolution.test.ts`
- Test: `src/main/server/routes/chat-route.test.ts`
- Test: `src/main/server/routes/assistant-heartbeat-route.test.ts`
- Test: `src/main/cron/cron-scheduler-service.test.ts`
- Test: `src/main/heartbeat/heartbeat-scheduler-service.test.ts`

**Step 1: Write the failing test**

Do not add new behavior in this task. Use the existing suite as the failing safety net if any extraction regressed:

- chat streaming
- cron execution
- heartbeat execution
- runtime-managed MCP resolution
- thread compaction
- assistant tool registration

**Step 2: Run test to verify it fails**

Run the full targeted regression set and capture any failures before patching:

```bash
npx vitest run src/main/mastra/assistant-runtime.test.ts src/main/mastra/assistant-runtime.runtime-resolution.test.ts src/main/server/routes/chat-route.test.ts src/main/server/routes/assistant-heartbeat-route.test.ts src/main/cron/cron-scheduler-service.test.ts src/main/heartbeat/heartbeat-scheduler-service.test.ts
```

Expected: PASS if the refactor preserved behavior. If it fails, only patch behavioral drift exposed by this command.

**Step 3: Write minimal implementation**

Fix only the regressions exposed by the targeted suite. Do not introduce new architectural changes here.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run typecheck
npx vitest run src/main/mastra/assistant-runtime.test.ts src/main/mastra/assistant-runtime.runtime-resolution.test.ts src/main/server/routes/chat-route.test.ts src/main/server/routes/assistant-heartbeat-route.test.ts src/main/cron/cron-scheduler-service.test.ts src/main/heartbeat/heartbeat-scheduler-service.test.ts
npx electron-vite build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime.test.ts src/main/mastra/assistant-runtime.runtime-resolution.test.ts src/main/server/routes/chat-route.test.ts src/main/server/routes/assistant-heartbeat-route.test.ts src/main/cron/cron-scheduler-service.test.ts src/main/heartbeat/heartbeat-scheduler-service.test.ts
git commit -m "test: verify assistant runtime modularization"
```
