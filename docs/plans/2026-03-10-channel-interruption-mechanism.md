# Channel Interruption Mechanism Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent overlapping channel replies by adding per-conversation queue, interrupt, and explicit resume behavior to inbound channel handling.

**Architecture:** Refactor `ChannelMessageRouter` so each remote conversation owns serialized execution state with an active run, FIFO queue, paused-task stack, and abort-driven interruption handling. Use a deterministic queue-vs-interrupt heuristic for the first implementation and treat aborts as control flow.

**Tech Stack:** TypeScript, Electron main process, existing assistant runtime abort support, Vitest

---

### Task 1: Define interruption behavior with failing router tests

**Files:**

- Modify: `src/main/channels/channel-message-router.test.ts`

**Step 1: Write the failing tests**

Add focused coverage for:

- queueing a second inbound message while the first run is still active
- interrupting the first run and prioritizing the new message
- resuming a paused message when the user sends `continue`
- suppressing generic error replies for intentional aborts

Test sketch:

```ts
it('queues an incoming message while the current run is active', async () => {
  const firstRun = createDeferredStream()
  const secondRun = createAssistantReplyStream('second reply')
  const streamChat = vi
    .fn<AssistantRuntime['streamChat']>()
    .mockResolvedValueOnce(firstRun.stream)
    .mockResolvedValueOnce(secondRun)

  void router.handleInboundEvent(firstEvent)
  await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1))

  const secondEventPromise = router.handleInboundEvent(secondEvent)

  expect(streamChat).toHaveBeenCalledTimes(1)

  firstRun.finish('first reply')
  await secondEventPromise

  expect(streamChat).toHaveBeenCalledTimes(2)
})
```

**Step 2: Run the focused test to verify RED**

Run:

```bash
npm run test -- src/main/channels/channel-message-router.test.ts
```

Expected: FAIL because the router currently starts every inbound message immediately and has no pause / resume state.

**Step 3: Commit**

```bash
git add src/main/channels/channel-message-router.test.ts
git commit -m "test: define channel interruption behavior"
```

---

### Task 2: Implement per-conversation queue, interrupt, and resume control

**Files:**

- Modify: `src/main/channels/channel-message-router.ts`
- Modify: `src/main/channels/channel-message-router.test.ts`

**Step 1: Write the minimal implementation**

Refactor `ChannelMessageRouter` to:

- keep conversation state per `channelId + remoteChatId`
- serialize state mutations with a per-conversation promise chain
- pass an `AbortSignal` into `assistantRuntime.streamChat()`
- route overlapping inbound messages through queue vs interrupt logic
- pause interrupted work items for later explicit resume
- detect strict resume commands and replay the paused message
- avoid publishing generic error replies when a run was intentionally aborted

**Step 2: Run the focused test to verify GREEN**

Run:

```bash
npm run test -- src/main/channels/channel-message-router.test.ts
```

Expected: PASS

**Step 3: Refactor for clarity**

Keep the implementation tight by extracting:

- conversation key/state helpers
- interrupt decision helper
- work item cloning for paused tasks
- abort detection helper

**Step 4: Run the focused test again**

Run:

```bash
npm run test -- src/main/channels/channel-message-router.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/channels/channel-message-router.ts src/main/channels/channel-message-router.test.ts
git commit -m "feat: add channel interruption control"
```

---

### Task 3: Run adjacent verification

**Files:**

- No code changes required unless regressions appear

**Step 1: Run adjacent channel tests**

Run:

```bash
npm run test -- src/main/channels/channel-message-router.test.ts src/main/channels/channel-service.test.ts src/main/channels/channel-event-bus.test.ts
```

Expected: PASS

**Step 2: Run typecheck for touched main-process code**

Run:

```bash
npm run typecheck:node
```

Expected: PASS

**Step 3: Commit**

```bash
git add docs/plans/2026-03-10-channel-interruption-mechanism-design.md docs/plans/2026-03-10-channel-interruption-mechanism.md
git commit -m "docs: plan channel interruption control"
```
