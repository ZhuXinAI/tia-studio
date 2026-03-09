# Channels / Telegram DM Pairing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a DM-only Telegram channel powered by `telegraf`, gate access with owner-approved pairings, and manage Telegram setup plus pairing approvals from the existing `Claws` flow.

**Architecture:** Reuse the existing channel bus, thread binding, and claw setup model. Add a new `app_channel_pairings` table plus repository, implement Telegram-specific pairing checks inside a `TelegramChannel` adapter, generalize the channel router so metadata reflects the real channel type, and extend the claws API/renderer with Telegram setup and pairing management.

**Tech Stack:** Electron 39, Hono, React 19, React Router 7, TypeScript 5, Vitest 4, SQLite/libsql, Mastra, `telegraf`

---

## Execution rules

- Apply `@test-driven-development` on every task: red → green → refactor.
- Keep Telegram pairing logic transport-local; do not build a generic access-control layer in this slice.
- Keep v1 strictly DM-only and text-only.
- Use `@verification-before-completion` before claiming the feature is done.
- Do not mix unrelated i18n work into this branch.

---

### Task 1: Add Telegram pairing persistence

**Files:**

- Modify: `src/main/persistence/migrate.ts`
- Modify: `src/main/persistence/migrate.test.ts`
- Create: `src/main/persistence/repos/channel-pairings-repo.ts`
- Create: `src/main/persistence/repos/channel-pairings-repo.test.ts`

**Step 1: Write the failing tests**

Add repository and migration coverage for:

- creating the `app_channel_pairings` table
- inserting a pending pairing row
- refreshing an existing pending row instead of duplicating it
- approving, rejecting, and revoking a pairing
- counting pairings by status per channel
- listing pairings newest-pending-first

Test sketch:

```ts
it('creates or refreshes a pending pairing for the same sender', async () => {
  const first = await repo.createOrRefreshPending({
    channelId: 'channel-1',
    remoteChatId: '12345',
    senderId: '12345',
    senderDisplayName: 'Alice',
    senderUsername: 'alice',
    code: 'AB7KQ2XM',
    expiresAt: '2026-03-09T01:00:00.000Z'
  })

  const second = await repo.createOrRefreshPending({
    channelId: 'channel-1',
    remoteChatId: '12345',
    senderId: '12345',
    senderDisplayName: 'Alice',
    senderUsername: 'alice',
    code: 'CD8LM9NP',
    expiresAt: '2026-03-09T02:00:00.000Z'
  })

  expect(second.id).toBe(first.id)
  expect(second.code).toBe('CD8LM9NP')
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/persistence/repos/channel-pairings-repo.test.ts src/main/persistence/migrate.test.ts
```

Expected: FAIL because the pairings table and repository do not exist yet.

**Step 3: Write minimal implementation**

- Extend `ensureChannelsTables(db)` in `src/main/persistence/migrate.ts` to create `app_channel_pairings`.
- Add repository types:

```ts
export type ChannelPairingStatus = 'pending' | 'approved' | 'rejected' | 'revoked'

export type AppChannelPairing = {
  id: string
  channelId: string
  remoteChatId: string
  senderId: string
  senderDisplayName: string
  senderUsername: string | null
  code: string
  status: ChannelPairingStatus
  expiresAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  revokedAt: string | null
  lastSeenAt: string
  createdAt: string
  updatedAt: string
}
```

- Add repository methods such as:
  - `createOrRefreshPending(input)`
  - `getByChannelAndSender(channelId, remoteChatId, senderId)`
  - `getById(id)`
  - `listByChannelId(channelId)`
  - `countByChannelIdAndStatus(channelId, status)`
  - `countActivePendingByChannelId(channelId)`
  - `approve(id, approvedAt)`
  - `reject(id, rejectedAt)`
  - `revoke(id, revokedAt)`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/persistence/repos/channel-pairings-repo.test.ts src/main/persistence/migrate.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/persistence/migrate.ts src/main/persistence/migrate.test.ts src/main/persistence/repos/channel-pairings-repo.ts src/main/persistence/repos/channel-pairings-repo.test.ts
git commit -m "feat: add telegram pairing persistence"
```

---

### Task 2: Implement the Telegram adapter and pairing gate

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/main/channels/types.ts`
- Create: `src/main/channels/telegram-channel.ts`
- Create: `src/main/channels/telegram-channel.test.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing tests**

Add adapter coverage for:

- ignoring non-private chats
- ignoring non-text messages
- creating a pending pairing and replying with a code
- reusing the same pending pairing before expiry
- blocking `rejected` and `revoked` users
- forwarding `approved` text DMs as normalized `ChannelMessage`
- sending assistant replies back through Telegram

Test sketch:

```ts
it('creates a pending pairing and does not emit a message for an unknown dm', async () => {
  const onMessage = vi.fn()
  const pairingsRepo = createPairingsRepoStub()
  const bot = createTelegramBotStub()
  const channel = new TelegramChannel({
    id: 'channel-1',
    botToken: '123:token',
    pairingsRepo,
    telegram: bot,
    now: () => new Date('2026-03-09T00:00:00.000Z')
  })
  channel.onMessage = onMessage

  await channel.start()
  await bot.deliverPrivateText({
    chatId: '1001',
    userId: '1001',
    text: 'hello'
  })

  expect(onMessage).not.toHaveBeenCalled()
  expect(bot.replyText).toHaveBeenCalledWith('1001', expect.stringContaining('AB7KQ2XM'))
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/channels/telegram-channel.test.ts
```

Expected: FAIL because the adapter and dependency wiring do not exist yet.

**Step 3: Write minimal implementation**

- Add `telegraf` to dependencies.
- Extend `ChannelType` to:

```ts
export type ChannelType = 'lark' | 'telegram'
```

- Create `TelegramChannel` with constructor options:

```ts
type TelegramChannelOptions = {
  id: string
  botToken: string
  pairingsRepo: ChannelPairingsRepositoryLike
  telegram?: TelegramSdkLike
  now?: () => Date
}
```

- Implement:
  - `start()` using Telegraf long polling
  - `stop()` to stop polling cleanly
  - `send(remoteChatId, message)` via Telegram `sendMessage`
  - private-chat text handling with pairing checks
  - short-code generation and 1-hour expiry
  - pending cap of 3 active requests per channel

- In `src/main/index.ts`, instantiate `ChannelPairingsRepository` and pass a custom `telegram` adapter factory into `ChannelService`.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/channels/telegram-channel.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/main/channels/types.ts src/main/channels/telegram-channel.ts src/main/channels/telegram-channel.test.ts src/main/index.ts
git commit -m "feat: add telegram channel adapter"
```

---

### Task 3: Generalize channel routing metadata for Telegram

**Files:**

- Modify: `src/main/channels/channel-message-router.ts`
- Modify: `src/main/channels/channel-message-router.test.ts`

**Step 1: Write the failing tests**

Add router coverage proving that:

- `metadata.fromChannel` uses `event.channelType` instead of hardcoded `'lark'`
- Telegram sender metadata survives into assistant runtime input
- outbound assistant text still routes back through the event bus unchanged

Test sketch:

```ts
expect(streamChat).toHaveBeenCalledWith(
  expect.objectContaining({
    messages: [
      expect.objectContaining({
        metadata: expect.objectContaining({
          fromChannel: 'telegram',
          channelType: 'telegram',
          remoteChatId: '1001'
        })
      })
    ]
  })
)
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/channels/channel-message-router.test.ts
```

Expected: FAIL because router metadata is currently Lark-specific.

**Step 3: Write minimal implementation**

- Replace hardcoded Lark metadata with event-driven values.
- Merge adapter-provided message metadata into the saved user message metadata when present.
- Keep thread creation and outbound publish behavior unchanged.

Minimal target shape:

```ts
metadata: {
  fromChannel: event.channelType,
  channelId: event.channelId,
  channelType: event.channelType,
  remoteChatId: event.message.remoteChatId,
  remoteMessageId: event.message.id,
  senderId: event.message.senderId,
  ...event.message.metadata
}
```

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/channels/channel-message-router.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/channels/channel-message-router.ts src/main/channels/channel-message-router.test.ts
git commit -m "refactor: generalize channel router metadata"
```

---

### Task 4: Extend the claws API for Telegram setup and pairing actions

**Files:**

- Modify: `src/main/server/validators/claws-validator.ts`
- Modify: `src/main/server/routes/claws-route.ts`
- Modify: `src/main/server/routes/claws-route.test.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing tests**

Add route coverage for:

- creating a Telegram claw with `botToken`
- updating an existing claw to attach or create a Telegram channel
- returning Telegram pairing counts from `GET /v1/claws`
- listing pairings for a Telegram claw
- approving a pending pairing
- rejecting a pending pairing
- revoking an approved pairing
- rejecting pairing actions for non-Telegram or missing channels

Test sketch:

```ts
it('approves a pending telegram pairing', async () => {
  const response = await app.request('/v1/claws/assistant-1/pairings/pairing-1/approve', {
    method: 'POST',
    headers: authHeaders
  })

  expect(response.status).toBe(200)
  await expect(pairingsRepo.getById('pairing-1')).resolves.toEqual(
    expect.objectContaining({ status: 'approved' })
  )
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/server/routes/claws-route.test.ts
```

Expected: FAIL because Telegram validation, pairing summaries, and pairing endpoints do not exist yet.

**Step 3: Write minimal implementation**

- Extend validators with:

```ts
const createTelegramChannelSchema = z.object({
  mode: z.literal('create'),
  type: z.literal('telegram'),
  name: z.string().min(1),
  botToken: z.string().min(1)
})
```

- Update create/update claw flows so Telegram channel config persists as:

```ts
config: {
  botToken: parsed.data.channel.botToken
}
```

- Extend claw response mapping with:
  - `pairedCount`
  - `pendingPairingCount`

- Add pairing endpoints under `claws-route.ts` using the new repository methods.
- Pass `ChannelPairingsRepository` through `createApp(...)` and `src/main/index.ts`.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/server/routes/claws-route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/server/validators/claws-validator.ts src/main/server/routes/claws-route.ts src/main/server/routes/claws-route.test.ts src/main/server/create-app.ts src/main/index.ts
git commit -m "feat: add telegram claw pairing endpoints"
```

---

### Task 5: Add Telegram setup and pairing management to the renderer

**Files:**

- Modify: `src/renderer/src/features/claws/claws-query.ts`
- Modify: `src/renderer/src/features/claws/claws-query.test.ts`
- Modify: `src/renderer/src/features/claws/components/claw-editor-dialog.tsx`
- Create: `src/renderer/src/features/claws/components/claw-pairings-dialog.tsx`
- Modify: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Modify: `src/renderer/src/features/claws/pages/claws-page.test.tsx`

**Step 1: Write the failing tests**

Add renderer coverage for:

- switching the claw editor between Lark and Telegram fields
- requiring `botToken` for Telegram creates
- rendering pairing counts on Telegram claw cards
- opening the pairings dialog
- approving and revoking pairings from the dialog

Test sketch:

```tsx
await user.selectOptions(screen.getByLabelText(/channel type/i), 'telegram')
await user.type(screen.getByLabelText(/bot token/i), '123:token')
await user.click(screen.getByRole('button', { name: /create claw/i }))

expect(createClaw).toHaveBeenCalledWith(
  expect.objectContaining({
    channel: expect.objectContaining({
      type: 'telegram',
      botToken: '123:token'
    })
  })
)
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/pages/claws-page.test.tsx
```

Expected: FAIL because the Telegram fields, query types, and pairing dialog do not exist yet.

**Step 3: Write minimal implementation**

- Extend `SaveClawInput` with a Telegram create variant.
- Add query helpers:
  - `listClawPairings(assistantId)`
  - `approveClawPairing(assistantId, pairingId)`
  - `rejectClawPairing(assistantId, pairingId)`
  - `revokeClawPairing(assistantId, pairingId)`
- Update `ClawChannelRecord` to include:

```ts
pairedCount?: number
pendingPairingCount?: number
```

- Update the editor dialog to switch fields by channel type.
- Add a lightweight `ClawPairingsDialog` that shows pending first and fires the new query mutations.
- Surface a `Manage Pairings` button only for Telegram channels.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/pages/claws-page.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/claws/claws-query.ts src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/components/claw-editor-dialog.tsx src/renderer/src/features/claws/components/claw-pairings-dialog.tsx src/renderer/src/features/claws/pages/claws-page.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx
git commit -m "feat: manage telegram pairings from claws"
```

---

### Task 6: Verify the full Telegram slice end-to-end

**Files:**

- Modify: any files touched above only if verification uncovers Telegram-specific defects

**Step 1: Run focused regression suites**

Run:

```bash
npm run test -- src/main/persistence/repos/channel-pairings-repo.test.ts src/main/channels/telegram-channel.test.ts src/main/channels/channel-message-router.test.ts src/main/server/routes/claws-route.test.ts src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/pages/claws-page.test.tsx
```

Expected: PASS

**Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS

**Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Fix only Telegram-related failures if needed**

- If failures are unrelated pre-existing issues, document them and do not expand scope.
- If failures are caused by this feature, make the minimal correction in the touched files and rerun the failing command.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add telegram dm pairing channel"
```

---

## Notes for the implementing agent

- Follow the official Telegram and Telegraf DM model; do not add webhook-only assumptions.
- Keep pairing strings human-readable and deterministic only within a single pending row lifetime; use random generation, not user-id hashes.
- Avoid storing platform-specific logic in the renderer when the main process can own it.
- Do not change Lark behavior unless a shared abstraction truly requires it.
