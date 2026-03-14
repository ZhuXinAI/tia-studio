# Team Supervisor Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert team execution to an explicit supervisor-as-tool pattern so member work streams through tool output, remains memory-backed, and carries mention-aware routing hints.

**Architecture:** Keep the team supervisor as the single outward-facing agent, but replace implicit `agents` delegation with explicit per-member Mastra tools that call member agents via `stream(...)` and pipe `fullStream` into the tool writer. Preserve Mastra memory for supervisor and members, add structured member-tool results/status metadata for routing, and teach the renderer to present these tool runs as readable member output instead of opaque JSON.

**Tech Stack:** Electron, React, TypeScript, Vitest, Mastra, AI SDK, assistant-ui

---

### Task 1: Plan the runtime refactor

**Files:**
- Modify: `src/main/mastra/team-runtime.ts`
- Test: `src/main/mastra/team-runtime.test.ts`

**Step 1: Write the failing runtime tests**

Add tests that prove:
- the supervisor receives member tools instead of `agents`
- a member tool streams through the tool writer while returning structured output
- member results include parsed mentions for routing/status purposes

**Step 2: Run test to verify it fails**

Run: `npm run test:main -- src/main/mastra/team-runtime.test.ts`
Expected: FAIL on missing member tool behavior/assertions

**Step 3: Write minimal runtime implementation**

Implement helper(s) in `src/main/mastra/team-runtime.ts` to:
- build runnable member agents plus their provider/workspace metadata
- create one streaming tool per member
- call `agent.stream(...)` inside the tool and forward `fullStream` chunks to `context.writer`
- return structured tool output such as member identity, final text, mentions, and sub-agent thread/resource ids
- switch supervisor construction from `agents: memberAgents` to `tools: memberTools`

**Step 4: Run test to verify it passes**

Run: `npm run test:main -- src/main/mastra/team-runtime.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/team-runtime.ts src/main/mastra/team-runtime.test.ts
git commit -m "feat: stream team members as supervisor tools"
```

### Task 2: Tighten prompts and status metadata

**Files:**
- Modify: `src/main/mastra/team-runtime.ts`
- Modify: `src/main/server/chat/team-run-status-store.ts`
- Test: `src/main/mastra/team-runtime.test.ts`

**Step 1: Write the failing test**

Add assertions that:
- supervisor instructions explain tool-based delegation and mention-aware routing
- member instructions include team context, roster guidance, and mention expectations
- status events include member labels / mentions where available

**Step 2: Run test to verify it fails**

Run: `npm run test:main -- src/main/mastra/team-runtime.test.ts`
Expected: FAIL on missing prompt/status fields

**Step 3: Write minimal implementation**

Update prompt builders and status event payloads so the supervisor can reason over mention recommendations and the UI can label member activity cleanly.

**Step 4: Run test to verify it passes**

Run: `npm run test:main -- src/main/mastra/team-runtime.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/team-runtime.ts src/main/server/chat/team-run-status-store.ts src/main/mastra/team-runtime.test.ts
git commit -m "feat: add routing context to team delegation"
```

### Task 3: Render member tool output in the team chat UI

**Files:**
- Modify: `src/renderer/src/components/assistant-ui/tool-fallback.tsx`
- Modify: `src/renderer/src/features/team/components/team-chat-card.tsx`
- Test: `src/renderer/src/features/team/components/team-chat-card.test.tsx`

**Step 1: Write the failing UI test**

Add a renderer test that covers a team member tool result containing streamed text/mentions and verifies it renders as readable member output instead of raw JSON.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/src/features/team/components/team-chat-card.test.tsx`
Expected: FAIL because team member tool output is still shown with the generic fallback

**Step 3: Write minimal UI implementation**

Enhance the shared tool fallback (or attach a team-specific tool component) so tool results with team-member metadata render:
- member name
- streamed/final text
- mention chips or labels
- optional thread/resource ids when useful for debugging

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/renderer/src/features/team/components/team-chat-card.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/components/assistant-ui/tool-fallback.tsx src/renderer/src/features/team/components/team-chat-card.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx
git commit -m "feat: render team member tool output in chat"
```

### Task 4: End-to-end verification

**Files:**
- Modify if needed: `src/renderer/src/i18n/locales/en-US.json`

**Step 1: Run focused validation**

Run:
- `npm run test:main -- src/main/mastra/team-runtime.test.ts`
- `npm run test -- src/renderer/src/features/team/components/team-chat-card.test.tsx`
- `npm run typecheck`

Expected: PASS

**Step 2: Smoke check in app**

Run: `npm run dev`
Expected: A team thread shows supervisor output plus per-member tool activity while streaming

**Step 3: Commit**

```bash
git add .
git commit -m "feat: align team runtime with supervisor tool delegation"
```
