# Channels / Lark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a main-process channel system with a shared event bus, connect Lark as the first transport, route each remote Lark conversation into one bound assistant thread, and manage the integration from a new Settings page.

**Architecture:** Build a dedicated `src/main/channels` subsystem for transport adapters and event pub/sub, then add a separate channel router that subscribes to inbound events and drives the existing `AssistantRuntimeService`. Persist channel settings plus remote-to-local thread mappings in SQLite, reuse the normal assistant thread history path with `metadata.fromChannel = "lark"`, and expose configuration through a new Settings page.

**Tech Stack:** Electron 39, Hono, React 19, React Router 7, TypeScript 5, Vitest 4, Mastra `handleChatStream`, SQLite/libsql, `@larksuiteoapi/node-sdk`

---

## Execution rules

- Apply **TDD** for every task (`red -> green -> refactor`).
- Keep the transport layer separate from assistant routing logic.
- Reuse the gateway channel shape where it fits, but do not copy gateway-only scheduling/interruption features.
- Use the existing default profile resource id `default-profile` for channel-created threads in this pass.
- Preserve message metadata in history; do not add a custom renderer badge unless tests prove normal history rendering is insufficient.

---

### Task 1: Add channel persistence and thread mapping

**Files:**
- Modify: `src/main/persistence/migrate.ts`
- Modify: `src/main/persistence/migrate.test.ts`
- Create: `src/main/persistence/repos/channels-repo.ts`
- Create: `src/main/persistence/repos/channels-repo.test.ts`
- Create: `src/main/persistence/repos/channel-thread-bindings-repo.ts`
- Create: `src/main/persistence/repos/channel-thread-bindings-repo.test.ts`

**Step 1: Write the failing tests**

Create repository coverage for:

- empty default state when no channels exist
- creating and updating a Lark channel record with `assistantId`, `enabled`, and config payload
- creating and reusing a remote-chat-to-local-thread binding
- migration creating `app_channels` and `app_channel_thread_bindings`

Test sketch:

```ts
it('stores a lark channel binding', async () => {
  const channel = await repo.create({
    type: 'lark',
    name: 'Lark',
    assistantId: 'assistant-1',
    enabled: true,
    config: {
      appId: 'cli_xxx',
      appSecret: 'secret'
    }
  })

  expect(channel.type).toBe('lark')
  expect(channel.assistantId).toBe('assistant-1')
})

it('reuses an existing thread binding for the same remote chat', async () => {
  const binding = await bindingsRepo.create({
    channelId: 'channel-1',
    remoteChatId: 'oc_123',
    threadId: 'thread-1'
  })

  const found = await bindingsRepo.getByChannelAndRemoteChat('channel-1', 'oc_123')
  expect(found?.threadId).toBe(binding.threadId)
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/persistence/repos/channels-repo.test.ts src/main/persistence/repos/channel-thread-bindings-repo.test.ts src/main/persistence/migrate.test.ts
```

Expected: FAIL because the channel tables and repositories do not exist yet.

**Step 3: Write minimal implementation**

- Extend `migrate.ts` with an `ensureChannelsTables(db)` helper.
- Add:
  - `app_channels`
  - `app_channel_thread_bindings`
- Recommended schema:

```ts
type AppChannel = {
  id: string
  type: 'lark'
  name: string
  assistantId: string | null
  enabled: boolean
  config: Record<string, unknown>
  lastError: string | null
  createdAt: string
  updatedAt: string
}

type AppChannelThreadBinding = {
  channelId: string
  remoteChatId: string
  threadId: string
  createdAt: string
}
```

- Keep config JSON-based so Telegram can reuse the same table later.
- Add repository methods such as:
  - `list()`
  - `getById(id)`
  - `getByType(type)`
  - `create(input)`
  - `update(id, input)`
  - `listEnabled()`
  - `getByChannelAndRemoteChat(channelId, remoteChatId)`
  - `create(input)`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/persistence/repos/channels-repo.test.ts src/main/persistence/repos/channel-thread-bindings-repo.test.ts src/main/persistence/migrate.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/persistence/migrate.ts src/main/persistence/migrate.test.ts src/main/persistence/repos/channels-repo.ts src/main/persistence/repos/channels-repo.test.ts src/main/persistence/repos/channel-thread-bindings-repo.ts src/main/persistence/repos/channel-thread-bindings-repo.test.ts
git commit -m "feat: add channel persistence"
```

---

### Task 2: Add main-process channel event bus and service boundaries

**Files:**
- Create: `src/main/channels/types.ts`
- Create: `src/main/channels/channel-event-bus.ts`
- Create: `src/main/channels/abstract-channel.ts`
- Create: `src/main/channels/channel-service.ts`
- Create: `src/main/channels/channel-event-bus.test.ts`
- Create: `src/main/channels/channel-service.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- subscribing and publishing `channel.message.received`
- subscribing and publishing `channel.message.send-requested`
- channel service registering active channels and wiring `onMessage`
- channel service stopping and reloading channel instances

Test sketch:

```ts
it('publishes inbound channel messages to subscribers', async () => {
  const bus = new ChannelEventBus()
  const handler = vi.fn()

  bus.subscribe('channel.message.received', handler)

  await bus.publish('channel.message.received', {
    eventId: 'evt-1',
    channelId: 'channel-1',
    channelType: 'lark',
    message: {
      id: 'msg-1',
      remoteChatId: 'chat-1',
      senderId: 'user-1',
      content: 'hello',
      timestamp: new Date()
    }
  })

  expect(handler).toHaveBeenCalledOnce()
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/channels/channel-event-bus.test.ts src/main/channels/channel-service.test.ts
```

Expected: FAIL because the channel subsystem does not exist yet.

**Step 3: Write minimal implementation**

- Define normalized types:

```ts
export interface ChannelMessage {
  id: string
  remoteChatId: string
  senderId: string
  content: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface ChannelAdapter {
  readonly id: string
  readonly type: 'lark'
  start(): Promise<void>
  stop(): Promise<void>
  send(remoteChatId: string, message: string): Promise<void>
  onMessage?: (message: ChannelMessage) => Promise<void> | void
}
```

- Add bus event types:
  - `channel.message.received`
  - `channel.message.send-requested`
- `ChannelService` should:
  - build adapters from enabled repo records
  - bridge adapter `onMessage` callbacks into the bus
  - subscribe to outbound send requests and call adapter `send(...)`
  - expose `start()`, `reload()`, and `stop()`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/channels/channel-event-bus.test.ts src/main/channels/channel-service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/channels/types.ts src/main/channels/channel-event-bus.ts src/main/channels/abstract-channel.ts src/main/channels/channel-service.ts src/main/channels/channel-event-bus.test.ts src/main/channels/channel-service.test.ts
git commit -m "feat: add channel event bus and service"
```

---

### Task 3: Implement the Lark transport adapter

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/main/channels/lark-channel.ts`
- Create: `src/main/channels/lark-channel.test.ts`
- Modify: `src/main/channels/channel-service.ts`

**Step 1: Write the failing tests**

Add adapter coverage for:

- normalizing a Lark `im.message.receive_v1` event into `ChannelMessage`
- starting the websocket client with provided credentials
- sending a text reply to the same Lark chat
- ignoring unsupported non-text payloads for v1

Test sketch:

```ts
it('converts a lark message event to the shared channel contract', async () => {
  const channel = new LarkChannel({
    id: 'channel-lark',
    appId: 'cli_xxx',
    appSecret: 'secret'
  })

  const message = channel['toChannelMessage'](fixtureEvent)

  expect(message.remoteChatId).toBe('oc_123')
  expect(message.content).toBe('hello from lark')
})
```

**Step 2: Install the dependency and confirm the gap**

Run:

```bash
pnpm add @larksuiteoapi/node-sdk
npm run test -- src/main/channels/lark-channel.test.ts
```

Expected: the package installs, then the test FAILS because the adapter implementation is missing.

**Step 3: Write minimal implementation**

- Create `LarkChannel` modeled after the gateway reference but trimmed for TIA Studio needs.
- Support:
  - `start()` via Lark websocket/event dispatcher
  - `stop()` cleanup
  - `send(remoteChatId, message)` for text replies
- Normalize message metadata to include raw Lark identifiers:

```ts
metadata: {
  larkChatId: event.message.chat_id,
  larkMessageId: event.message.message_id,
  larkThreadId: event.message.thread_id ?? null
}
```

- Update `ChannelService` to construct `LarkChannel` when `channel.type === 'lark'`.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/channels/lark-channel.test.ts src/main/channels/channel-service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/main/channels/lark-channel.ts src/main/channels/lark-channel.test.ts src/main/channels/channel-service.ts
git commit -m "feat: add lark channel adapter"
```

---

### Task 4: Route inbound channel messages into assistant threads

**Files:**
- Create: `src/main/channels/channel-message-router.ts`
- Create: `src/main/channels/channel-message-router.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- resolving the saved channel record and bound assistant
- creating a new local thread when a remote Lark chat is first seen
- reusing the same local thread on later messages from the same remote chat
- calling `assistantRuntime.streamChat(...)` with a synthetic user `UIMessage`
- preserving:
  - `metadata.fromChannel = "lark"`
  - `channelId`
  - `remoteChatId`
  - `remoteMessageId`

Test sketch:

```ts
it('creates one local thread per remote lark conversation', async () => {
  await router.handleInboundEvent({
    eventId: 'evt-1',
    channelId: 'channel-1',
    channelType: 'lark',
    message: {
      id: 'msg-1',
      remoteChatId: 'oc_123',
      senderId: 'ou_user',
      content: 'hello',
      timestamp: new Date()
    }
  })

  await router.handleInboundEvent({
    eventId: 'evt-2',
    channelId: 'channel-1',
    channelType: 'lark',
    message: {
      id: 'msg-2',
      remoteChatId: 'oc_123',
      senderId: 'ou_user',
      content: 'follow up',
      timestamp: new Date()
    }
  })

  expect(createThreadMock).toHaveBeenCalledTimes(1)
  expect(streamChatMock).toHaveBeenCalledTimes(2)
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/channels/channel-message-router.test.ts src/main/mastra/assistant-runtime.test.ts
```

Expected: FAIL because no routing subscriber exists yet.

**Step 3: Write minimal implementation**

- Add `ChannelMessageRouter` that subscribes to `channel.message.received`.
- Resolve or create thread mapping:
  - lookup bound assistant from `app_channels`
  - lookup existing binding in `app_channel_thread_bindings`
  - if missing, create `app_threads` row with title `New Thread`
  - save the binding
- Build the synthetic inbound message:

```ts
const userMessage: UIMessage = {
  id: `channel:${event.channelId}:${event.message.id}`,
  role: 'user',
  parts: [{ type: 'text', text: event.message.content }],
  metadata: {
    fromChannel: 'lark',
    channelId: event.channelId,
    channelType: event.channelType,
    remoteChatId: event.message.remoteChatId,
    remoteMessageId: event.message.id,
    senderId: event.message.senderId
  }
}
```

- Call `assistantRuntime.streamChat(...)` with:
  - `assistantId` from the saved channel config
  - `threadId` from the binding
  - `profileId: 'default-profile'`
  - `messages: [userMessage]`
- Drain the stream to completion so normal history/title sync still happens.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/channels/channel-message-router.test.ts src/main/mastra/assistant-runtime.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/channels/channel-message-router.ts src/main/channels/channel-message-router.test.ts src/main/index.ts src/main/mastra/assistant-runtime.test.ts
git commit -m "feat: route channel messages into assistant threads"
```

---

### Task 5: Publish assistant replies back to the channel

**Files:**
- Modify: `src/main/channels/channel-event-bus.ts`
- Modify: `src/main/channels/channel-message-router.ts`
- Modify: `src/main/channels/channel-service.test.ts`
- Modify: `src/main/channels/channel-message-router.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- capturing assistant text from the drained stream
- publishing `channel.message.send-requested` with the original `channelId` and `remoteChatId`
- channel service receiving that event and calling `adapter.send(...)`
- not sending an outbound reply when the captured assistant text is empty

Test sketch:

```ts
it('publishes a send request after the assistant finishes', async () => {
  const publishedEvents: unknown[] = []
  bus.subscribe('channel.message.send-requested', (event) => {
    publishedEvents.push(event)
  })

  await router.handleInboundEvent(inboundEvent)

  expect(publishedEvents).toContainEqual(
    expect.objectContaining({
      channelId: 'channel-1',
      remoteChatId: 'oc_123',
      content: 'Hello from assistant'
    })
  )
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/channels/channel-message-router.test.ts src/main/channels/channel-service.test.ts
```

Expected: FAIL because the router does not emit outbound events yet.

**Step 3: Write minimal implementation**

- Extend the router to capture assistant text while draining `UIMessageChunk`s.
- After a successful run, publish:

```ts
await bus.publish('channel.message.send-requested', {
  eventId: randomUUID(),
  channelId: event.channelId,
  channelType: event.channelType,
  remoteChatId: event.message.remoteChatId,
  content: assistantReplyText
})
```

- Keep the transport layer dumb: it only listens for send requests and delivers them.
- Do not move assistant execution into the channel service.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/channels/channel-message-router.test.ts src/main/channels/channel-service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/channels/channel-event-bus.ts src/main/channels/channel-message-router.ts src/main/channels/channel-service.test.ts src/main/channels/channel-message-router.test.ts
git commit -m "feat: publish assistant replies to channels"
```

---

### Task 6: Expose channel settings API and wire startup lifecycle

**Files:**
- Create: `src/main/server/validators/channels-validator.ts`
- Create: `src/main/server/routes/channels-settings-route.ts`
- Create: `src/main/server/routes/channels-settings-route.test.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing tests**

Add route coverage for:

- loading saved channel settings
- upserting the Lark settings record
- validating required `appId`, `appSecret`, and `assistantId`
- triggering `channelService.reload()` after a successful save

Test sketch:

```ts
it('updates lark settings and reloads channels', async () => {
  const response = await app.request('/v1/settings/channels', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify({
      lark: {
        enabled: true,
        name: 'Lark',
        assistantId: 'assistant-1',
        appId: 'cli_xxx',
        appSecret: 'secret'
      }
    })
  })

  expect(response.status).toBe(200)
  expect(reloadMock).toHaveBeenCalledOnce()
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/server/routes/channels-settings-route.test.ts
```

Expected: FAIL because the route and validator do not exist yet.

**Step 3: Write minimal implementation**

- Add a settings route at `/v1/settings/channels`.
- Suggested response shape:

```ts
type ChannelsSettingsResponse = {
  lark: {
    id: string | null
    enabled: boolean
    name: string
    assistantId: string | null
    appId: string
    appSecret: string
    status: 'disconnected' | 'connected' | 'error'
    errorMessage: string | null
  }
}
```

- Validate the Lark payload with Zod.
- In `src/main/index.ts`:
  - instantiate `ChannelsRepository`
  - instantiate `ChannelThreadBindingsRepository`
  - create the shared `ChannelEventBus`
  - create `ChannelService`
  - create `ChannelMessageRouter`
  - start the channel service after the local API server bootstraps
  - stop the channel service during app shutdown

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/server/routes/channels-settings-route.test.ts src/main/channels/channel-service.test.ts src/main/channels/channel-message-router.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/server/validators/channels-validator.ts src/main/server/routes/channels-settings-route.ts src/main/server/routes/channels-settings-route.test.ts src/main/server/create-app.ts src/main/index.ts
git commit -m "feat: add channel settings api"
```

---

### Task 7: Add the Channels settings page in the renderer

**Files:**
- Create: `src/renderer/src/features/settings/channels/channels-query.ts`
- Create: `src/renderer/src/features/settings/pages/channels-settings-page.tsx`
- Create: `src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`
- Modify: `src/renderer/src/features/settings/components/settings-sidebar-nav.tsx`
- Modify: `src/renderer/src/features/threads/chat-query.test.ts`

**Step 1: Write the failing tests**

Add renderer coverage for:

- `Channels` appearing in the settings sidebar
- router rendering `/settings/channels`
- loading assistants and current Lark settings
- saving updated `appId`, `appSecret`, and `assistantId`
- rendering the setup guide link
- preserving `metadata.fromChannel` when history is loaded from the chat API

Test sketch:

```tsx
it('renders lark settings fields and assistant selector', async () => {
  render(<ChannelsSettingsPage />)

  expect(await screen.findByLabelText(/app id/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/app secret/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/assistant/i)).toBeInTheDocument()
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/features/settings/pages/channels-settings-page.test.tsx src/renderer/src/app/router.test.tsx src/renderer/src/features/threads/chat-query.test.ts
```

Expected: FAIL because the Channels page and queries do not exist yet.

**Step 3: Write minimal implementation**

- Add `Channels` to the settings nav and router.
- Create `channels-query.ts` with:
  - `getChannelsSettings()`
  - `updateChannelsSettings(input)`
- Build a single Lark form page that includes:
  - enabled switch
  - display name
  - `app_id`
  - `app_secret`
  - assistant selector from `listAssistants()`
  - setup guide link
- Keep the page local-state driven like existing settings pages.
- Do not add extra renderer behavior for channel history beyond ensuring metadata survives API reads.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/renderer/src/features/settings/pages/channels-settings-page.test.tsx src/renderer/src/app/router.test.tsx src/renderer/src/features/threads/chat-query.test.ts
npm run typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/settings/channels/channels-query.ts src/renderer/src/features/settings/pages/channels-settings-page.tsx src/renderer/src/features/settings/pages/channels-settings-page.test.tsx src/renderer/src/app/router.tsx src/renderer/src/app/router.test.tsx src/renderer/src/features/settings/components/settings-sidebar-nav.tsx src/renderer/src/features/threads/chat-query.test.ts
git commit -m "feat: add channels settings page"
```

---

### Task 8: Run focused verification and then the broader suite

**Files:**
- Modify: `docs/plans/2026-03-08-channels-lark-design.md`
- Modify: `docs/plans/2026-03-08-channels-lark-implementation.md`

**Step 1: Run focused main-process tests**

Run:

```bash
npm run test -- src/main/channels src/main/server/routes/channels-settings-route.test.ts src/main/persistence/repos/channels-repo.test.ts src/main/persistence/repos/channel-thread-bindings-repo.test.ts
```

Expected: PASS

**Step 2: Run focused renderer tests**

Run:

```bash
npm run test -- src/renderer/src/features/settings/pages/channels-settings-page.test.tsx src/renderer/src/app/router.test.tsx src/renderer/src/features/threads/chat-query.test.ts
```

Expected: PASS

**Step 3: Run typecheck and full tests**

Run:

```bash
npm run typecheck
npm run test
```

Expected: PASS

**Step 4: Update docs if implementation drifted**

- If file names, route shapes, or event names changed during implementation, update this plan and the design doc so they match the actual code.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-08-channels-lark-design.md docs/plans/2026-03-08-channels-lark-implementation.md
git commit -m "docs: finalize channels implementation notes"
```
