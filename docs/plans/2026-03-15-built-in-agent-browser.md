# Built-in Agent Browser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a built-in browser automation option that covers the common `agent-browser` workflow, exposes a selectable built-in vs external mode, and lets the main assistant delegate browser work to a focused subagent that streams results back.

**Architecture:** Extend the existing built-in Electron browser process instead of introducing a second browser stack. Add a persisted browser automation mode setting, implement a typed command protocol plus snapshot rendering inside the built-in browser child process, and register a dedicated Mastra browser subagent behind a streaming delegation tool so the main assistant can offload browser-heavy tasks without carrying the full loop in its own context.

**Tech Stack:** Electron `BrowserWindow` + `webContents.debugger`, raw Chrome DevTools Protocol commands, Mastra agents/tools, Zod, Hono, React, Vitest.

---

### Task 1: Persist Browser Automation Mode

**Files:**

- Modify: `src/main/persistence/repos/web-search-settings-repo.ts`
- Modify: `src/main/server/validators/web-search-validator.ts`
- Modify: `src/main/server/routes/web-search-settings-route.ts`
- Modify: `src/main/server/routes/web-search-settings-route.test.ts`
- Modify: `src/renderer/src/features/settings/web-search/web-search-query.ts`
- Modify: `src/renderer/src/features/settings/pages/web-search-settings-page.tsx`
- Modify: `src/renderer/src/features/settings/pages/web-search-settings-page.test.tsx`

**Step 1: Write the failing tests**

Add assertions that web-search settings now round-trip a `browserAutomationMode` field and that the settings page can switch between built-in and external automation.

**Step 2: Run targeted tests**

Run: `npm run test -- src/main/server/routes/web-search-settings-route.test.ts src/renderer/src/features/settings/pages/web-search-settings-page.test.tsx`

**Step 3: Write minimal implementation**

Add a persisted enum setting, expose it on the route and query layer, and render a compact UI control in the browser settings page.

**Step 4: Re-run targeted tests**

Run the same command and confirm the new mode passes through correctly.

**Step 5: Commit**

Commit message: `feat: add browser automation mode setting`

### Task 2: Extend Built-in Browser Command Surface

**Files:**

- Modify: `src/main/built-in-browser-contract.ts`
- Modify: `src/main/built-in-browser-manager.ts`
- Modify: `src/main/built-in-browser-manager.test.ts`
- Modify: `src/main/built-in-browser.ts`

**Step 1: Write the failing tests**

Add manager-level tests for sending a browser command through IPC and receiving a structured result, alongside any contract coverage needed for snapshot options or action routing.

**Step 2: Run targeted tests**

Run: `npm run test -- src/main/built-in-browser-manager.test.ts src/main/built-in-browser-contract.test.ts`

**Step 3: Write minimal implementation**

Expand the IPC contract with a typed automation command/result payload, implement the manager request lifecycle, and add built-in browser child-process support for:

- `open`
- `close`
- `snapshot`
- `click`
- `dblclick`
- `focus`
- `fill`
- `type`
- `press`
- `keydown`
- `keyup`
- `hover`
- `check`
- `uncheck`
- `select`
- `scroll`
- `scrollIntoView`
- `drag`
- `upload`
- `get`
- `wait`

Port the snapshot tree shaping logic from `agent-browser`’s accessibility-tree approach, but keep the first pass intentionally scoped to the most common fields and rendering rules.

**Step 4: Re-run targeted tests**

Run the same manager/contract tests and fix any regressions.

**Step 5: Commit**

Commit message: `feat: add built-in browser automation commands`

### Task 3: Add Browser Subagent and Streaming Tool

**Files:**

- Create: `src/main/mastra/browser-agent.ts`
- Modify: `src/main/mastra/tools/built-in-browser-tools.ts`
- Modify: `src/main/mastra/assistant-runtime.ts`
- Modify: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing tests**

Add assistant-runtime coverage showing that built-in mode registers a browser delegation tool, that the tool can invoke the browser subagent, and that streamed browser output is piped through the tool writer.

**Step 2: Run targeted tests**

Run: `npm run test -- src/main/mastra/assistant-runtime.test.ts`

**Step 3: Write minimal implementation**

Register a dedicated browser agent with instructions tailored to the built-in browser tool, expose the low-level browser action tool to that subagent, and add a top-level delegation tool that:

- starts a fresh browser-agent thread/resource for isolation
- calls `agent.stream(...)`
- pipes `fullStream` to `context.writer`
- returns the final text plus delegation metadata

Gate the built-in browser delegation path on the new `browserAutomationMode` setting so external `agent-browser` remains the default unless the user opts into the built-in flow.

**Step 4: Re-run targeted tests**

Run the assistant-runtime test command again and confirm registration/streaming behavior.

**Step 5: Commit**

Commit message: `feat: add built-in browser subagent`

### Task 4: Validate End-to-End Surface

**Files:**

- Modify: any files touched above as needed

**Step 1: Run focused quality checks**

Run: `npm run test -- src/main/built-in-browser-manager.test.ts src/main/server/routes/web-search-settings-route.test.ts src/main/mastra/assistant-runtime.test.ts src/renderer/src/features/settings/pages/web-search-settings-page.test.tsx`

**Step 2: Run type checks**

Run: `npm run typecheck`

**Step 3: Summarize remaining gaps**

Document any unsupported `agent-browser` commands that were intentionally left out of the built-in subset and any browser edge cases that still fall back to manual handoff.

**Step 4: Commit**

Commit message: `test: verify built-in browser integration`
