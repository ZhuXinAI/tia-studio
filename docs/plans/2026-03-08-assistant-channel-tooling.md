# Assistant Channel Tooling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add gateway-style assistant workspace context plus merged channel tools to TIA Studio, with outbound channel actions publishing to a main-process event bus.

**Architecture:** Create a small `src/main/channels` event bus that represents outbound channel requests. Add assistant-workspace bootstrapping so each assistant workspace owns `IDENTITY.md`, `SOUL.md`, `MEMORY.md`, and `HEARTBEAT.md`. Then add Mastra tools for SOUL memory and merged channel sending, and wire them into `AssistantRuntimeService` so each registered assistant gets the extra tools and context loader.

**Tech Stack:** TypeScript, Vitest, Electron main process, Mastra agent runtime, local filesystem utilities.

---

### Task 1: Add the channel event bus

**Files:**
- Create: `src/main/channels/types.ts`
- Create: `src/main/channels/channel-event-bus.ts`
- Create: `src/main/channels/channel-event-bus.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- subscribing to `channel.message.send-requested`
- publishing a text outbound payload
- publishing an image outbound payload
- unsubscribing a listener

**Step 2: Run test to verify it fails**

Run: `npm test -- src/main/channels/channel-event-bus.test.ts`
Expected: FAIL because the bus files do not exist yet.

**Step 3: Write minimal implementation**

- Define typed channel event payloads in `src/main/channels/types.ts`
- Add a simple in-memory pub/sub bus in `src/main/channels/channel-event-bus.ts`
- Support `publish(eventName, payload)` and `subscribe(eventName, handler)` returning an unsubscribe function

**Step 4: Run test to verify it passes**

Run: `npm test -- src/main/channels/channel-event-bus.test.ts`
Expected: PASS

### Task 2: Add assistant workspace bootstrap helpers

**Files:**
- Create: `src/main/mastra/assistant-workspace.ts`
- Create: `src/main/mastra/assistant-workspace.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- creating `IDENTITY.md`, `SOUL.md`, `MEMORY.md`, and `HEARTBEAT.md` inside a provided workspace root
- leaving existing files untouched
- resolving relative assistant file paths against the workspace root

**Step 2: Run test to verify it fails**

Run: `npm test -- src/main/mastra/assistant-workspace.test.ts`
Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

- Add `ensureAssistantWorkspaceFiles(rootPath)`
- Add `resolveAssistantWorkspacePath(rootPath, filePath)`
- Seed only the four required files with short templates

**Step 4: Run test to verify it passes**

Run: `npm test -- src/main/mastra/assistant-workspace.test.ts`
Expected: PASS

### Task 3: Add SOUL memory and merged channel tools

**Files:**
- Create: `src/main/mastra/tool-context.ts`
- Create: `src/main/mastra/tools/soul-memory-tools.ts`
- Create: `src/main/mastra/tools/soul-memory-tools.test.ts`
- Create: `src/main/mastra/tools/channel-tools.ts`
- Create: `src/main/mastra/tools/channel-tools.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- `read-soul-memory` returning the assistant workspace file contents
- `update-soul-memory` appending and overwriting correctly
- the context input processor loading `IDENTITY.md`, `SOUL.md`, and `MEMORY.md`
- the context input processor loading `HEARTBEAT.md` only for heartbeat runs
- `send-message-to-channel` publishing a text payload to the bus
- `send-image` publishing an image payload with a resolved file path
- `send-file` publishing a file payload with a default file name

**Step 2: Run test to verify it fails**

Run: `npm test -- src/main/mastra/tools/soul-memory-tools.test.ts src/main/mastra/tools/channel-tools.test.ts`
Expected: FAIL because the tools do not exist yet.

**Step 3: Write minimal implementation**

- Define shared request-context keys in `src/main/mastra/tool-context.ts`
- Implement `createSoulMemoryTools({ workspaceRootPath })`
- Implement `assistantWorkspaceContextInputProcessor({ workspaceRootPath })`
- Implement merged `createChannelTools({ bus, workspaceRootPath })` returning:
  - `send-message-to-channel`
  - `send-image`
  - `send-file`
- Make channel tools publish only `channel.message.send-requested` events

**Step 4: Run test to verify it passes**

Run: `npm test -- src/main/mastra/tools/soul-memory-tools.test.ts src/main/mastra/tools/channel-tools.test.ts`
Expected: PASS

### Task 4: Wire the tools into assistant runtime

**Files:**
- Modify: `src/main/mastra/assistant-runtime.ts`
- Modify: `src/main/mastra/assistant-runtime.test.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing tests**

Add tests for:
- ensuring assistant workspace files are bootstrapped when an assistant workspace is configured
- registering the SOUL tools and merged channel tools with the agent
- including the workspace context input processor alongside the attachment uploader

**Step 2: Run test to verify it fails**

Run: `npm test -- src/main/mastra/assistant-runtime.test.ts`
Expected: FAIL because the runtime is not wiring the new helpers yet.

**Step 3: Write minimal implementation**

- Inject a `ChannelEventBus` into `AssistantRuntimeService`
- Bootstrap assistant workspace files inside `buildWorkspace(...)`
- Add SOUL tools and merged channel tools to the registered agent’s tool map
- Add the workspace context input processor to `inputProcessors`
- Create one bus instance in `src/main/index.ts` and pass it into the runtime

**Step 4: Run test to verify it passes**

Run: `npm test -- src/main/channels/channel-event-bus.test.ts src/main/mastra/assistant-workspace.test.ts src/main/mastra/tools/soul-memory-tools.test.ts src/main/mastra/tools/channel-tools.test.ts src/main/mastra/assistant-runtime.test.ts`
Expected: PASS

### Notes

- Cron tooling is intentionally deferred in this pass because TIA Studio does not yet have the gateway scheduler / heartbeat execution subsystem that backs those tools.
- The bus is outbound-only for now, matching the requirement that channel tools publish to the pipeline boundary instead of talking to adapters directly.
