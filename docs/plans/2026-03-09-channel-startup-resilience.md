# Channel Startup Resilience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make app startup resilient so channel failures or hanging channel startups never block TIA Studio boot.

**Architecture:** Tighten the adapter startup contract so `start()` resolves after readiness instead of transport lifetime, then make `ChannelService` start each runtime-enabled channel independently with timeout protection and persisted health updates through `app_channels.last_error`.

**Tech Stack:** TypeScript, Electron main process, Vitest, Telegraf, existing SQLite repositories

---

### Task 1: Add resilient channel startup behavior

**Files:**

- Modify: `src/main/channels/channel-service.ts`
- Modify: `src/main/channels/channel-service.test.ts`
- Modify: `src/main/persistence/repos/channels-repo.ts`
- Modify: `src/main/persistence/repos/channels-repo.test.ts`

**Step 1: Write the failing tests**

Add service and repository coverage for:

- continuing startup when one adapter rejects
- timing out a hanging adapter startup while allowing another adapter to start
- persisting `lastError` for failed channels
- clearing a stale `lastError` after a successful startup

Test sketch:

```ts
it('continues startup when one adapter times out', async () => {
  const hangingAdapter = new FakeChannel('channel-timeout', 'telegram')
  hangingAdapter.startMock.mockImplementation(() => new Promise(() => undefined))

  const healthyAdapter = new FakeChannel('channel-ok', 'lark')

  await service.start()

  expect(healthyAdapter.startMock).toHaveBeenCalledOnce()
  expect(recordLastError).toHaveBeenCalledWith(
    'channel-timeout',
    expect.stringContaining('timed out')
  )
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/channels/channel-service.test.ts src/main/persistence/repos/channels-repo.test.ts
```

Expected: FAIL because startup is still fail-fast/blocking and the repository does not yet expose focused health helpers.

**Step 3: Write minimal implementation**

- Add focused repository methods for channel health updates, such as:

```ts
setLastError(id: string, message: string | null): Promise<AppChannel | null>
clearLastError(id: string): Promise<AppChannel | null>
```

- Update `ChannelService` to:
  - attempt every runtime-enabled channel independently
  - wrap each adapter `start()` in an `8000` ms timeout
  - persist failure messages without throwing out of `start()`
  - clear stale `lastError` after a successful start
  - add adapters to the live map only after successful startup

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/channels/channel-service.test.ts src/main/persistence/repos/channels-repo.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/channels/channel-service.ts src/main/channels/channel-service.test.ts src/main/persistence/repos/channels-repo.ts src/main/persistence/repos/channels-repo.test.ts
git commit -m "fix: make channel startup resilient"
```

---

### Task 2: Make Telegram startup resolve promptly

**Files:**

- Modify: `src/main/channels/telegram-channel.ts`
- Modify: `src/main/channels/telegram-channel.test.ts`

**Step 1: Write the failing tests**

Add adapter coverage for:

- `start()` resolving after readiness even when the background polling promise never settles
- not double-starting when `start()` is called twice
- preserving existing send/inbound behavior

Test sketch:

```ts
it('resolves startup without waiting for the lifetime polling promise', async () => {
  let launchStarted = false
  const launch = vi.fn(async () => {
    launchStarted = true
    await new Promise(() => undefined)
  })

  const channel = new TelegramChannel({
    id: 'channel-1',
    botToken: '123:token',
    pairingsRepo,
    client: { onText, launch, stop, sendMessage }
  })

  await expect(
    Promise.race([channel.start().then(() => 'resolved'), Promise.resolve().then(() => 'pending')])
  ).resolves.toBe('resolved')
  expect(launchStarted).toBe(true)
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/channels/telegram-channel.test.ts
```

Expected: FAIL because startup currently awaits the long-running polling promise.

**Step 3: Write minimal implementation**

- Change the Telegram client startup behavior so `launch()` only waits for readiness and starts polling in the background.
- Keep `TelegramChannel.start()` idempotent and prompt.
- Preserve existing inbound text handling and outbound send behavior.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/channels/telegram-channel.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/channels/telegram-channel.ts src/main/channels/telegram-channel.test.ts
git commit -m "fix: make telegram startup non-blocking"
```
