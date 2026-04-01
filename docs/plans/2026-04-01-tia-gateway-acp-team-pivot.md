# TIA Gateway + ACP + Team Pivot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reposition TIA Studio around a gateway execution layer plus ACP-backed execution and team orchestration, while keeping existing assistant, channel, and workspace concepts intact.

**Architecture:** Introduce a main-process gateway service that becomes the single execution ingress for direct chat, team chat, channel delivery, cron, and heartbeat runs. Keep the current Mastra-backed assistant and team runtimes initially, but treat them as execution adapters behind the gateway so TIA stops expanding custom harness behavior in multiple places. Narrow the product surface toward ACP-backed coding/execution targets and team coordination, with existing managed runtimes, skills, and workspace features retained only as support infrastructure.

**Tech Stack:** Electron 39, React 19, Hono, Mastra, ACP providers, TypeScript 5, Vitest 4, LibSQL

---

## Execution Rules

- Apply **TDD** for code tasks (`red -> green -> refactor`).
- Do not rewrite the assistant/channel/team data model; preserve assistant-first identity.
- Keep the first pass backward-compatible with current providers, `workspaceConfig`, `skillsConfig`, channels, cron jobs, and team workspaces.
- Favor additive seams and route migration over broad in-place rewrites.
- Keep commits small and focused, ideally one commit per task when executing.

---

### Task 1: Introduce a main-process run gateway contract

**Files:**

- Create: `src/main/gateway/run-gateway.ts`
- Create: `src/main/gateway/run-gateway.test.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing test**

Create `src/main/gateway/run-gateway.test.ts` with focused coverage for:

- delegating direct assistant chat calls to the existing assistant runtime
- delegating team chat calls to the existing team runtime
- delegating cron and heartbeat execution through one shared interface
- exposing a normalized run source enum such as `chat`, `team`, `channel`, `cron`, `heartbeat`

Test sketch:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createRunGateway } from './run-gateway'

describe('createRunGateway', () => {
  it('routes assistant chat through the assistant runtime', async () => {
    const assistantRuntime = {
      streamChat: vi.fn(async () => new ReadableStream())
    }

    const gateway = createRunGateway({
      assistantRuntime: assistantRuntime as never,
      teamRuntime: {} as never
    })

    await gateway.streamAssistantChat({
      assistantId: 'assistant-1',
      threadId: 'thread-1',
      profileId: 'profile-1',
      messages: []
    })

    expect(assistantRuntime.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({ assistantId: 'assistant-1', threadId: 'thread-1' })
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/main/gateway/run-gateway.test.ts
```

Expected: FAIL because the gateway service does not exist yet.

**Step 3: Write minimal implementation**

- Create `createRunGateway(...)` with methods:
  - `streamAssistantChat(...)`
  - `listAssistantThreadMessages(...)`
  - `runAssistantThreadCommand(...)`
  - `streamTeamChat(...)`
  - `listTeamThreadMessages(...)`
  - `runCronJob(...)`
  - `runHeartbeat(...)`
- Keep the implementation thin in the first pass: it should orchestrate the existing runtime services rather than replacing them.
- Register the gateway in `src/main/index.ts` and keep the old runtime service construction untouched for now.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/main/gateway/run-gateway.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/gateway/run-gateway.ts src/main/gateway/run-gateway.test.ts src/main/index.ts
git commit -m "feat: add unified run gateway"
```

---

### Task 2: Move direct chat, team chat, and channel ingress onto the gateway

**Files:**

- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/server/routes/chat-route.ts`
- Modify: `src/main/server/routes/chat-route.test.ts`
- Modify: `src/main/server/routes/team-chat-route.ts`
- Modify: `src/main/server/routes/team-chat-route.test.ts`
- Modify: `src/main/channels/channel-message-router.ts`
- Modify: `src/main/channels/channel-message-router.test.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing tests**

Add coverage for:

- `chat-route` calling the gateway instead of the raw assistant runtime
- `team-chat-route` calling the gateway instead of the raw team runtime
- `ChannelMessageRouter` sending inbound channel work through the gateway while preserving existing thread-binding behavior

Test sketch:

```ts
it('routes assistant chat through the run gateway', async () => {
  const gateway = {
    streamAssistantChat: vi.fn(async () => new ReadableStream()),
    listAssistantThreadMessages: vi.fn(),
    runAssistantThreadCommand: vi.fn()
  }

  const app = new Hono()
  registerChatRoute(app, {
    runGateway: gateway as never
  })

  // exercise POST /chat/:assistantId and assert gateway call
})
```

**Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test -- src/main/server/routes/chat-route.test.ts src/main/server/routes/team-chat-route.test.ts src/main/channels/channel-message-router.test.ts
```

Expected: FAIL because the routes and router still depend on runtime-specific interfaces.

**Step 3: Write minimal implementation**

- Change the route registration contracts in `create-app.ts` to accept the run gateway instead of separate runtime objects.
- Update `chat-route.ts` to use gateway methods for:
  - chat streaming
  - history listing
  - slash-command thread actions
- Update `team-chat-route.ts` to use gateway methods for:
  - team streaming
  - team history listing
- Update `ChannelMessageRouter` to call the gateway for inbound channel execution and keep queue/interruption logic local to the router.
- Keep request/response payloads and route paths unchanged so the renderer remains compatible.

**Step 4: Re-run focused tests**

Run:

```bash
npm run test -- src/main/server/routes/chat-route.test.ts src/main/server/routes/team-chat-route.test.ts src/main/channels/channel-message-router.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/server/create-app.ts src/main/server/routes/chat-route.ts src/main/server/routes/chat-route.test.ts src/main/server/routes/team-chat-route.ts src/main/server/routes/team-chat-route.test.ts src/main/channels/channel-message-router.ts src/main/channels/channel-message-router.test.ts src/main/index.ts
git commit -m "refactor: route chat and channel ingress through gateway"
```

---

### Task 3: Route scheduled execution through the same gateway

**Files:**

- Modify: `src/main/cron/node-cron-scheduler-service.ts`
- Modify: `src/main/cron/cron-scheduler-service.test.ts`
- Modify: `src/main/heartbeat/heartbeat-scheduler-service.ts`
- Modify: `src/main/heartbeat/heartbeat-scheduler-service.test.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing tests**

Add coverage for:

- cron scheduler using the gateway for assistant job execution
- heartbeat scheduler using the gateway for proactive execution
- preserving current work-log and run-record behavior after the gateway call returns

Test sketch:

```ts
it('executes heartbeat runs through the run gateway', async () => {
  const runGateway = {
    runHeartbeat: vi.fn(async () => ({ outputText: 'done' }))
  }

  const scheduler = new HeartbeatSchedulerService({
    heartbeatsRepo,
    runHeartbeat: undefined,
    runGateway: runGateway as never
  })

  await scheduler.start()

  expect(runGateway.runHeartbeat).toHaveBeenCalled()
})
```

**Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test -- src/main/cron/cron-scheduler-service.test.ts src/main/heartbeat/heartbeat-scheduler-service.test.ts
```

Expected: FAIL because schedulers still depend on direct runtime runner functions.

**Step 3: Write minimal implementation**

- Extend scheduler options to accept the run gateway.
- Replace direct `runCronJob` and `runHeartbeat` runner wiring with gateway calls.
- Keep thread ownership, work-log writing, and error persistence in the scheduler/service layers; only execution transport should move.
- Update `src/main/index.ts` so both schedulers receive the shared gateway instance.

**Step 4: Re-run focused tests**

Run:

```bash
npm run test -- src/main/cron/cron-scheduler-service.test.ts src/main/heartbeat/heartbeat-scheduler-service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/cron/node-cron-scheduler-service.ts src/main/cron/cron-scheduler-service.test.ts src/main/heartbeat/heartbeat-scheduler-service.ts src/main/heartbeat/heartbeat-scheduler-service.test.ts src/main/index.ts
git commit -m "refactor: unify scheduled runs behind gateway"
```

---

### Task 4: Make ACP-backed execution the primary assistant coding/runtime path

**Files:**

- Modify: `src/main/default-agent/built-in-providers.ts`
- Modify: `src/main/server/routes/providers-route.ts`
- Modify: `src/main/server/routes/providers-route.test.ts`
- Modify: `src/main/mastra/assistant-runtime.ts`
- Modify: `src/main/mastra/assistant-runtime.test.ts`
- Modify: `src/renderer/src/features/assistants/assistant-editor.tsx`
- Modify: `src/renderer/src/features/assistants/assistant-editor.test.tsx`
- Modify: `src/renderer/src/features/settings/runtimes/managed-runtimes-query.ts`
- Modify: `src/renderer/src/features/settings/runtimes/runtime-onboarding-panel.tsx`

**Step 1: Write the failing tests**

Add or extend coverage for:

- assistant editor presenting ACP-backed coding targets as the preferred coding execution path
- provider surfaces and onboarding copy reflecting runtime/execution terminology instead of harness-specific terminology
- assistant runtime continuing to register ACP coding agents from existing `workspaceConfig.codingAgents`

Test sketch:

```ts
it('shows ACP coding targets as the coding execution options', async () => {
  render(<AssistantEditor ... />)

  expect(screen.getByLabelText('Enable Codex ACP')).toBeInTheDocument()
  expect(screen.getByLabelText('Enable Claude Agent ACP')).toBeInTheDocument()
})
```

**Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test -- src/main/server/routes/providers-route.test.ts src/main/mastra/assistant-runtime.test.ts src/renderer/src/features/assistants/assistant-editor.test.tsx
```

Expected: FAIL once the expected terminology and default behaviors are updated.

**Step 3: Write minimal implementation**

- Keep current ACP provider types and persistence shape for compatibility.
- Update provider/runtime copy so TIA is clearly positioning ACP runtimes as external execution engines managed by TIA rather than a TIA-owned harness.
- In the assistant editor:
  - keep existing coding-agent compatibility fields
  - make ACP-backed coding targets the explicit coding path
  - avoid adding new custom execution modes unless they are ACP-compatible
- In `assistant-runtime.ts`, keep the current ACP subagent registration but treat it as the preferred implementation path for coding delegation.

**Step 4: Re-run focused tests**

Run:

```bash
npm run test -- src/main/server/routes/providers-route.test.ts src/main/mastra/assistant-runtime.test.ts src/renderer/src/features/assistants/assistant-editor.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/default-agent/built-in-providers.ts src/main/server/routes/providers-route.ts src/main/server/routes/providers-route.test.ts src/main/mastra/assistant-runtime.ts src/main/mastra/assistant-runtime.test.ts src/renderer/src/features/assistants/assistant-editor.tsx src/renderer/src/features/assistants/assistant-editor.test.tsx src/renderer/src/features/settings/runtimes/managed-runtimes-query.ts src/renderer/src/features/settings/runtimes/runtime-onboarding-panel.tsx
git commit -m "refactor: make acp execution the primary coding path"
```

---

### Task 5: Strengthen team as the differentiated product surface

**Files:**

- Modify: `src/main/mastra/team-runtime.ts`
- Modify: `src/main/mastra/team-runtime.test.ts`
- Modify: `src/main/server/chat/team-run-status-store.ts`
- Modify: `src/renderer/src/features/team/components/team-status-graph.tsx`
- Modify: `src/renderer/src/features/team/components/team-status-graph.test.tsx`
- Modify: `src/renderer/src/features/team/components/team-config-dialog.tsx`
- Modify: `src/renderer/src/features/team/components/team-config-dialog.test.tsx`
- Modify: `README.md`
- Modify: `CLAW.md`
- Modify: `STRUCTURE.md`
- Create: `docs/tia-gateway-architecture.md`

**Step 1: Write the failing tests**

Add coverage for:

- team runtime exposing richer per-member execution events for delegated work
- team status graph rendering the new gateway/team run metadata
- team config dialog copy describing team composition in terms of specialists and execution backends rather than harness concepts

Test sketch:

```ts
it('records delegated member execution events for the status graph', async () => {
  const store = new TeamRunStatusStore()

  store.append('run-1', {
    type: 'member-started',
    data: { assistantId: 'assistant-1', assistantName: 'Researcher' }
  })

  expect(store.createStatusStream('run-1', 'thread-1')).not.toBeNull()
})
```

**Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test -- src/main/mastra/team-runtime.test.ts src/renderer/src/features/team/components/team-status-graph.test.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx
```

Expected: FAIL because the richer team/gateway event model and copy do not exist yet.

**Step 3: Write minimal implementation**

- Extend `team-runtime.ts` so supervisor/member delegation emits stable events that represent:
  - member selected
  - member started
  - member completed
  - team completed
- Persist or stream those events through `TeamRunStatusStore` without changing the existing team route contract.
- Update team UI copy and status rendering so “team” is clearly one of TIA’s primary product surfaces.
- Add `docs/tia-gateway-architecture.md` and update `README.md`, `CLAW.md`, and `STRUCTURE.md` so the public architecture story becomes:
  - TIA owns gateway/orchestration
  - ACP owns execution engines
  - teams/channels are the user-facing differentiation

**Step 4: Re-run focused tests and broad verification**

Run:

```bash
npm run test -- src/main/mastra/team-runtime.test.ts src/renderer/src/features/team/components/team-status-graph.test.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx
npm run typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/team-runtime.ts src/main/mastra/team-runtime.test.ts src/main/server/chat/team-run-status-store.ts src/renderer/src/features/team/components/team-status-graph.tsx src/renderer/src/features/team/components/team-status-graph.test.tsx src/renderer/src/features/team/components/team-config-dialog.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx README.md CLAW.md STRUCTURE.md docs/tia-gateway-architecture.md
git commit -m "feat: position team and gateway as core product surfaces"
```

---

## Rollout Notes

- Keep the first milestone internal and architectural. The goal is to establish the gateway seam without forcing a data migration.
- Do not remove existing `skills`, workspace support, or managed runtimes during the pivot; downgrade them from headline product concepts to support infrastructure.
- Once the gateway is stable, evaluate whether `assistant-runtime.ts` and `team-runtime.ts` should remain Mastra-specific adapters or move behind an explicit `execution-adapter` directory.
- Release messaging should emphasize continuity for existing assistants and claws: same local-first data, same workspaces, same channels, better separation of orchestration versus execution.

