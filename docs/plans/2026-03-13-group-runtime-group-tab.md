# Group Runtime and Group Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new `Group` workspace/tab where multiple assistants share one room transcript, can mention each other for direct follow-up, and are orchestrated by a new `GroupRuntime` that reuses `AssistantRuntimeService` for actual agent turns.

**Architecture:** Build a parallel `group` vertical beside `team`. Persist shared group workspaces, threads, shared room messages, and assistant-thread bindings in the app database; use a new in-process `GroupEventBus` and queued `GroupRunRouter` to serialize runs per thread; and extend `AssistantRuntimeService` with a `runGroupTurn()` path plus request-scoped group tools so assistants publish room actions back to the bus instead of streaming directly to the renderer. The renderer stays intentionally simple for v1: load history over HTTP, watch status/message SSE streams, and show a single typing indicator for the currently active assistant.

**Tech Stack:** Electron, React 19, React Router, Hono, Vitest, SQLite/libSQL, Mastra `handleChatStream`, AI SDK transport utilities where already used, in-process event buses, existing assistant/thread repositories.

---

### Task 1: Add Group Persistence Primitives

**Files:**
- Modify: `src/main/persistence/migrations/0001_app_core.sql`
- Modify: `src/main/persistence/migrations/0001_app_core.ts`
- Modify: `src/main/persistence/migrate.test.ts`
- Modify: `src/main/persistence/migrate-fallback.test.ts`
- Create: `src/main/persistence/repos/group-workspaces-repo.ts`
- Test: `src/main/persistence/repos/group-workspaces-repo.test.ts`
- Create: `src/main/persistence/repos/group-threads-repo.ts`
- Test: `src/main/persistence/repos/group-threads-repo.test.ts`

**Step 1: Write the failing repository tests**

```ts
it('stores group workspace config and ordered members', async () => {
  const workspace = await repo.create({
    name: 'Launch Group',
    rootPath: '/Users/demo/project'
  })

  await repo.update(workspace.id, {
    groupDescription: 'Brainstorm a launch plan',
    maxAutoTurns: 6
  })
  await repo.replaceMembers(workspace.id, ['assistant-1', 'assistant-2'])

  await expect(repo.getById(workspace.id)).resolves.toMatchObject({
    name: 'Launch Group',
    groupDescription: 'Brainstorm a launch plan',
    maxAutoTurns: 6
  })
  await expect(repo.listMembers(workspace.id)).resolves.toEqual([
    expect.objectContaining({ assistantId: 'assistant-1', sortOrder: 0 }),
    expect.objectContaining({ assistantId: 'assistant-2', sortOrder: 1 })
  ])
})

it('stores room messages and assistant thread bindings per group thread', async () => {
  const thread = await threadsRepo.create({
    workspaceId: 'workspace-1',
    resourceId: 'default-profile',
    title: ''
  })

  const watcherMessage = await threadsRepo.appendMessage({
    threadId: thread.id,
    role: 'user',
    authorType: 'watcher',
    authorName: 'You',
    content: 'Compare launch options',
    mentions: ['assistant-2']
  })

  await threadsRepo.upsertAssistantThreadBinding({
    groupThreadId: thread.id,
    assistantId: 'assistant-1',
    assistantThreadId: 'assistant-thread-1'
  })

  await expect(threadsRepo.listMessages(thread.id)).resolves.toMatchObject([
    {
      id: watcherMessage.id,
      role: 'user',
      authorType: 'watcher',
      content: 'Compare launch options',
      mentions: ['assistant-2']
    }
  ])
  await expect(threadsRepo.listAssistantThreadBindings(thread.id)).resolves.toEqual([
    expect.objectContaining({
      assistantId: 'assistant-1',
      assistantThreadId: 'assistant-thread-1'
    })
  ])
})
```

**Step 2: Run the persistence tests to verify they fail**

Run: `pnpm test -- src/main/persistence/repos/group-workspaces-repo.test.ts src/main/persistence/repos/group-threads-repo.test.ts src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts`

Expected: FAIL because the new group tables and repositories do not exist yet.

**Step 3: Write the minimal schema and repository implementation**

```sql
CREATE TABLE IF NOT EXISTS app_group_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL DEFAULT '',
  group_description TEXT NOT NULL DEFAULT '',
  max_auto_turns INTEGER NOT NULL DEFAULT 6,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_group_workspace_members (
  workspace_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, assistant_id)
);

CREATE TABLE IF NOT EXISTS app_group_threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_group_thread_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  author_type TEXT NOT NULL,
  author_id TEXT,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  mentions_json TEXT NOT NULL DEFAULT '[]',
  reply_to_message_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_group_thread_assistant_threads (
  group_thread_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  assistant_thread_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_thread_id, assistant_id)
);
```

```ts
export type AppGroupThreadMessage = {
  id: string
  threadId: string
  role: 'user' | 'assistant' | 'system'
  authorType: 'watcher' | 'assistant' | 'orchestrator'
  authorId: string | null
  authorName: string
  content: string
  mentions: string[]
  replyToMessageId: string | null
  createdAt: string
}
```

Implementation notes:
- Keep v1 orchestration config small: `groupDescription`, `maxAutoTurns`, workspace members, and workspace root path.
- Reuse `app_threads` for per-assistant subthreads instead of inventing another memory store.
- Store room messages separately from Mastra memory because the shared room transcript is multi-speaker and not equivalent to a single assistant thread.

**Step 4: Run the persistence tests again**

Run: `pnpm test -- src/main/persistence/repos/group-workspaces-repo.test.ts src/main/persistence/repos/group-threads-repo.test.ts src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts`

Expected: PASS with the new group schema and repository coverage green.

**Step 5: Commit**

```bash
git add src/main/persistence/migrations/0001_app_core.sql src/main/persistence/migrations/0001_app_core.ts src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/persistence/repos/group-workspaces-repo.ts src/main/persistence/repos/group-workspaces-repo.test.ts src/main/persistence/repos/group-threads-repo.ts src/main/persistence/repos/group-threads-repo.test.ts
git commit -m "feat: add group persistence primitives"
```

### Task 2: Expose Group Workspace and Thread CRUD APIs

**Files:**
- Create: `src/main/server/validators/group-validator.ts`
- Create: `src/main/server/routes/group-workspaces-route.ts`
- Test: `src/main/server/routes/group-workspaces-route.test.ts`
- Create: `src/main/server/routes/group-threads-route.ts`
- Test: `src/main/server/routes/group-threads-route.test.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/index.ts`

**Step 1: Write failing route tests**

```ts
it('creates and patches group workspaces under /v1/group/workspaces', async () => {
  const response = await app.request('http://localhost/v1/group/workspaces', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })
  })

  expect(response.status).toBe(201)
})

it('creates group threads under /v1/group/threads', async () => {
  const response = await app.request('http://localhost/v1/group/threads', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId: 'workspace-1',
      resourceId: 'default-profile'
    })
  })

  expect(response.status).toBe(201)
})
```

**Step 2: Run the route tests to verify they fail**

Run: `pnpm test -- src/main/server/routes/group-workspaces-route.test.ts src/main/server/routes/group-threads-route.test.ts`

Expected: FAIL because the validators, routes, and `createApp()` wiring are missing.

**Step 3: Implement the minimal group route surface**

```ts
export const createGroupWorkspaceSchema = z.object({
  name: z.string().trim().min(1),
  rootPath: z.string().trim().min(1)
})

export const updateGroupWorkspaceSchema = z.object({
  name: z.string().trim().min(1).optional(),
  rootPath: z.string().trim().min(1).optional(),
  groupDescription: z.string().optional(),
  maxAutoTurns: z.number().int().min(1).max(12).optional()
})

export const createGroupThreadSchema = z.object({
  workspaceId: z.string().trim().min(1),
  resourceId: z.string().trim().min(1),
  title: z.string().optional()
})
```

Routes to add:
- `GET /v1/group/workspaces`
- `POST /v1/group/workspaces`
- `PATCH /v1/group/workspaces/:workspaceId`
- `GET /v1/group/workspaces/:workspaceId/members`
- `PUT /v1/group/workspaces/:workspaceId/members`
- `DELETE /v1/group/workspaces/:workspaceId`
- `GET /v1/group/threads?workspaceId=...`
- `POST /v1/group/threads`
- `PATCH /v1/group/threads/:threadId`
- `DELETE /v1/group/threads/:threadId`

Implementation notes:
- Mirror the existing team route ergonomics so the renderer can reuse the same query/controller shape.
- Instantiate the new repositories in `src/main/index.ts` and add them to the `repositories` bag passed to `createApp()`.

**Step 4: Run the route tests again**

Run: `pnpm test -- src/main/server/routes/group-workspaces-route.test.ts src/main/server/routes/group-threads-route.test.ts`

Expected: PASS with the group CRUD API registered.

**Step 5: Commit**

```bash
git add src/main/server/validators/group-validator.ts src/main/server/routes/group-workspaces-route.ts src/main/server/routes/group-workspaces-route.test.ts src/main/server/routes/group-threads-route.ts src/main/server/routes/group-threads-route.test.ts src/main/server/create-app.ts src/main/index.ts
git commit -m "feat: add group workspace and thread routes"
```

### Task 3: Add Group Event Bus and SSE Stores

**Files:**
- Create: `src/main/groups/types.ts`
- Create: `src/main/groups/group-event-bus.ts`
- Test: `src/main/groups/group-event-bus.test.ts`
- Create: `src/main/server/chat/group-run-status-store.ts`
- Test: `src/main/server/chat/group-run-status-store.test.ts`
- Create: `src/main/server/chat/group-thread-events-store.ts`
- Test: `src/main/server/chat/group-thread-events-store.test.ts`

**Step 1: Write failing bus and store tests**

```ts
it('publishes and subscribes to group events in order', async () => {
  const bus = new GroupEventBus()
  const seen: string[] = []

  const unsubscribe = bus.subscribe('group.message.requested', async (event) => {
    seen.push(event.content)
  })

  await bus.publish('group.message.requested', {
    eventId: 'evt-1',
    runId: 'run-1',
    groupThreadId: 'group-thread-1',
    assistantId: 'assistant-1',
    content: 'I can take that',
    mentions: ['assistant-2']
  })

  unsubscribe()
  expect(seen).toEqual(['I can take that'])
})

it('replays buffered group thread events to new SSE listeners', async () => {
  const store = new GroupThreadEventsStore()
  store.appendMessageCreated({
    threadId: 'group-thread-1',
    profileId: 'default-profile',
    messageId: 'msg-1'
  })

  const stream = store.createThreadStream({
    threadId: 'group-thread-1',
    profileId: 'default-profile'
  })

  expect(stream).toBeTruthy()
})
```

**Step 2: Run the new tests to verify they fail**

Run: `pnpm test -- src/main/groups/group-event-bus.test.ts src/main/server/chat/group-run-status-store.test.ts src/main/server/chat/group-thread-events-store.test.ts`

Expected: FAIL because the group bus and SSE stores do not exist yet.

**Step 3: Implement the new event bus and stores**

```ts
export type GroupEventMap = {
  'group.run.requested': {
    runId: string
    groupThreadId: string
    profileId: string
    triggerMessageId: string
  }
  'group.message.requested': {
    eventId: string
    runId: string
    groupThreadId: string
    assistantId: string
    content: string
    mentions: string[]
    replyToMessageId?: string
  }
  'group.turn.passed': {
    eventId: string
    runId: string
    groupThreadId: string
    assistantId: string
    reason?: string
  }
}
```

```ts
export type GroupRunStatusEventType =
  | 'run-started'
  | 'speaker-selected'
  | 'turn-started'
  | 'message-posted'
  | 'turn-passed'
  | 'run-finished'
  | 'run-failed'
```

Implementation notes:
- Keep the bus API isomorphic with `ChannelEventBus`.
- Keep `GroupRunStatusStore` in-memory like `TeamRunStatusStore`.
- Add `GroupThreadEventsStore` for non-streaming UI refreshes. The renderer will use this to refetch room history after message creation.

**Step 4: Run the bus/store tests again**

Run: `pnpm test -- src/main/groups/group-event-bus.test.ts src/main/server/chat/group-run-status-store.test.ts src/main/server/chat/group-thread-events-store.test.ts`

Expected: PASS with ordered publish/subscribe semantics and SSE replay behavior covered.

**Step 5: Commit**

```bash
git add src/main/groups/types.ts src/main/groups/group-event-bus.ts src/main/groups/group-event-bus.test.ts src/main/server/chat/group-run-status-store.ts src/main/server/chat/group-run-status-store.test.ts src/main/server/chat/group-thread-events-store.ts src/main/server/chat/group-thread-events-store.test.ts
git commit -m "feat: add group bus and status stores"
```

### Task 4: Extend AssistantRuntimeService for Group Turns

**Files:**
- Modify: `src/main/mastra/assistant-runtime.ts`
- Modify: `src/main/mastra/tool-context.ts`
- Create: `src/main/mastra/tools/group-tools.ts`
- Test: `src/main/mastra/tools/group-tools.test.ts`
- Modify: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing group-turn tests**

```ts
it('runs a group turn and publishes room messages through group tools', async () => {
  const bus = new GroupEventBus()
  const published: string[] = []

  bus.subscribe('group.message.requested', async (event) => {
    published.push(event.content)
  })

  const result = await runtime.runGroupTurn({
    assistantId: 'assistant-1',
    threadId: 'assistant-thread-1',
    profileId: 'default-profile',
    groupContext: {
      runId: 'run-1',
      groupThreadId: 'group-thread-1',
      allowedMentions: [{ assistantId: 'assistant-2', name: 'Researcher' }]
    },
    messages: [
      {
        role: 'user',
        content: 'You are in a room. Ask @Researcher to verify the numbers.'
      }
    ]
  })

  expect(result.outputText).toBeTypeOf('string')
  expect(published.length).toBeGreaterThan(0)
})
```

**Step 2: Run the AssistantRuntime group-turn tests**

Run: `pnpm test -- src/main/mastra/tools/group-tools.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: FAIL because `runGroupTurn()` and the request-scoped group tools do not exist.

**Step 3: Add group turn execution and request-scoped tools**

```ts
type RunGroupTurnParams = {
  assistantId: string
  threadId: string
  profileId: string
  messages: MessageListInput
  groupContext: {
    runId: string
    groupThreadId: string
    allowedMentions: Array<{ assistantId: string; name: string }>
    replyToMessageId?: string
  }
}

type GroupTurnResult = {
  outputText: string
}
```

```ts
const postToGroup = createTool({
  id: 'post-to-group',
  inputSchema: z.object({
    message: z.string().min(1),
    mentions: z.array(z.string()).default([])
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ message, mentions }, context) => {
    const group = getGroupExecutionContext(context.requestContext)
    await options.bus.publish('group.message.requested', {
      eventId: randomUUID(),
      runId: group.runId,
      groupThreadId: group.groupThreadId,
      assistantId: group.assistantId,
      content: message,
      mentions
    })
    return { success: true }
  }
})
```

Implementation notes:
- Keep `AssistantRuntimeService` as the execution backend. `GroupRuntimeService` should not create ad-hoc Mastra agents itself.
- Add `groupToolsEnabled` to the agent registration signature so the tool set stays cache-safe.
- If the assistant produces plain text but does not call a group tool, treat that text as one fallback `post-to-group` action so v1 stays robust.
- Keep channel tools and group tools separate. They are similar patterns, but the event payloads and request context are different.

**Step 4: Run the AssistantRuntime tests again**

Run: `pnpm test -- src/main/mastra/tools/group-tools.test.ts src/main/mastra/assistant-runtime.test.ts`

Expected: PASS with `runGroupTurn()` and group tool publishing covered.

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime.ts src/main/mastra/tool-context.ts src/main/mastra/tools/group-tools.ts src/main/mastra/tools/group-tools.test.ts src/main/mastra/assistant-runtime.test.ts
git commit -m "feat: add assistant group turn execution"
```

### Task 5: Build GroupRuntimeService and Queued GroupRunRouter

**Files:**
- Create: `src/main/groups/group-turn-selector.ts`
- Test: `src/main/groups/group-turn-selector.test.ts`
- Create: `src/main/groups/group-run-router.ts`
- Test: `src/main/groups/group-run-router.test.ts`
- Create: `src/main/mastra/group-runtime.ts`
- Test: `src/main/mastra/group-runtime.test.ts`
- Create: `src/main/server/routes/group-chat-route.ts`
- Test: `src/main/server/routes/group-chat-route.test.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing orchestration tests**

```ts
it('selects mentioned assistants before round-robin fallbacks', () => {
  const nextSpeaker = selectNextGroupSpeaker({
    members: [
      { assistantId: 'assistant-1', name: 'Planner' },
      { assistantId: 'assistant-2', name: 'Researcher' }
    ],
    recentMessages: [
      {
        id: 'msg-1',
        authorId: 'assistant-1',
        mentions: ['assistant-2'],
        content: '@Researcher please verify the numbers'
      }
    ],
    speakersUsedInRun: ['assistant-1']
  })

  expect(nextSpeaker?.assistantId).toBe('assistant-2')
})

it('submits a watcher message, queues a run, and exposes status/history routes', async () => {
  const response = await app.request('http://localhost/group-chat/group-thread-1/messages', {
    method: 'POST',
    body: JSON.stringify({
      profileId: 'default-profile',
      content: 'Plan a launch rollout'
    })
  })

  expect(response.status).toBe(202)
  expect(response.headers.get('x-group-run-id')).toBeTruthy()
})
```

**Step 2: Run the orchestration tests to verify they fail**

Run: `pnpm test -- src/main/groups/group-turn-selector.test.ts src/main/groups/group-run-router.test.ts src/main/mastra/group-runtime.test.ts src/main/server/routes/group-chat-route.test.ts`

Expected: FAIL because the selector, runtime, router, and routes do not exist.

**Step 3: Implement the GroupRuntime + router loop**

```ts
export type GroupRuntime = {
  submitWatcherMessage(params: {
    threadId: string
    profileId: string
    content: string
    mentions?: string[]
  }): Promise<{ runId: string; messageId: string }>
  listGroupThreadMessages(params: {
    threadId: string
    profileId: string
  }): Promise<AppGroupThreadMessage[]>
}
```

```ts
function selectNextGroupSpeaker(input: {
  members: Array<{ assistantId: string; name: string }>
  recentMessages: Array<{ authorId: string | null; mentions: string[]; content: string }>
  speakersUsedInRun: string[]
}): { assistantId: string; name: string } | null {
  const latestMessage = input.recentMessages.at(-1)
  if (latestMessage?.mentions.length) {
    return input.members.find((member) => latestMessage.mentions.includes(member.assistantId)) ?? null
  }

  return input.members.find((member) => !input.speakersUsedInRun.includes(member.assistantId)) ?? input.members[0] ?? null
}
```

Run-loop notes:
- `GroupRuntimeService.submitWatcherMessage()` validates thread ownership, appends the watcher message, starts a run in `GroupRunStatusStore`, publishes `group.run.requested`, and returns `202` metadata.
- `GroupRunRouter` subscribes to `group.run.requested` and serializes execution per `groupThreadId`.
- For each selected assistant turn:
  - load workspace members and room history
  - ensure an underlying assistant subthread exists via `ThreadsRepository.create()`
  - build a compact prompt from room history, watcher request, mentions, roster, and workspace description
  - call `assistantRuntime.runGroupTurn()`
  - persist `group.message.requested` / `group.turn.passed` events as room messages or status updates
- Stop when one of these is true:
  - no next speaker is eligible
  - `maxAutoTurns` is reached
  - the latest assistant action asks the watcher for input
  - all remaining candidates pass in sequence

Route surface:
- `GET /group-chat/:threadId/history?profileId=...`
- `POST /group-chat/:threadId/messages`
- `GET /group-chat/:threadId/runs/:runId/status`
- `GET /group-chat/:threadId/events?profileId=...`

Implementation notes:
- Keep the orchestrator deterministic in v1: mentions first, then direct follow-up, then round-robin.
- Do not add an arbiter/supervisor model in the MVP. Leave that as a later extension point once the room mechanics feel good.
- Return JSON + SSE here, not AI SDK streaming. The UI only needs history, typing state, and status events.

**Step 4: Run the orchestration tests again**

Run: `pnpm test -- src/main/groups/group-turn-selector.test.ts src/main/groups/group-run-router.test.ts src/main/mastra/group-runtime.test.ts src/main/server/routes/group-chat-route.test.ts`

Expected: PASS with queued room runs and history/status routes working.

**Step 5: Commit**

```bash
git add src/main/groups/group-turn-selector.ts src/main/groups/group-turn-selector.test.ts src/main/groups/group-run-router.ts src/main/groups/group-run-router.test.ts src/main/mastra/group-runtime.ts src/main/mastra/group-runtime.test.ts src/main/server/routes/group-chat-route.ts src/main/server/routes/group-chat-route.test.ts src/main/server/create-app.ts src/main/index.ts
git commit -m "feat: add group runtime orchestration"
```

### Task 6: Add the Group Renderer Data Layer and Controller

**Files:**
- Create: `src/renderer/src/features/group/group-workspaces-query.ts`
- Create: `src/renderer/src/features/group/group-threads-query.ts`
- Create: `src/renderer/src/features/group/group-chat-query.ts`
- Create: `src/renderer/src/features/group/group-status-stream.ts`
- Create: `src/renderer/src/features/group/group-thread-events-stream.ts`
- Test: `src/renderer/src/features/group/group-queries.test.ts`
- Create: `src/renderer/src/features/group/hooks/use-group-page-controller.ts`
- Test: `src/renderer/src/features/group/hooks/use-group-page-controller.test.tsx`

**Step 1: Write the failing renderer data-layer tests**

```ts
it('calls the group workspace, thread, history, submit, and status endpoints', async () => {
  await expect(listGroupWorkspaces()).resolves.toHaveLength(1)
  await expect(listGroupThreads('workspace-1')).resolves.toHaveLength(1)
  await expect(
    submitGroupWatcherMessage({
      threadId: 'thread-1',
      profileId: 'default-profile',
      content: 'Plan the launch'
    })
  ).resolves.toMatchObject({ runId: 'run-1' })
})
```

```ts
it('opens a status stream after submit and refetches history on message events', async () => {
  const controller = renderHook(() => useGroupPageController()).result
  await controller.current.handleSubmitMessage('Plan the launch')
  expect(controller.current.isAgentTyping).toBe(true)
})
```

**Step 2: Run the renderer tests to verify they fail**

Run: `pnpm test -- src/renderer/src/features/group/group-queries.test.ts src/renderer/src/features/group/hooks/use-group-page-controller.test.tsx`

Expected: FAIL because the group renderer data layer and controller do not exist.

**Step 3: Implement the minimal group query/controller layer**

```ts
export type GroupRoomMessageRecord = {
  id: string
  threadId: string
  role: 'user' | 'assistant' | 'system'
  authorType: 'watcher' | 'assistant' | 'orchestrator'
  authorId: string | null
  authorName: string
  content: string
  mentions: string[]
  createdAt: string
}

export async function submitGroupWatcherMessage(input: {
  threadId: string
  profileId: string
  content: string
}): Promise<{ runId: string; messageId: string }> {
  return apiClient.post(`/group-chat/${input.threadId}/messages`, input)
}
```

Controller notes:
- Do not use `useChat()` for this page. Group is multi-speaker and non-streaming in v1.
- Load workspaces, selected workspace members, selected threads, and selected thread history directly.
- Keep one status SSE for the active run and one thread-events SSE for the selected thread.
- When `message-created` arrives, refetch thread history and bump the thread `lastMessageAt`.
- Expose `isAgentTyping` from the latest `turn-started` / `run-finished` state instead of token streaming.

**Step 4: Run the renderer tests again**

Run: `pnpm test -- src/renderer/src/features/group/group-queries.test.ts src/renderer/src/features/group/hooks/use-group-page-controller.test.tsx`

Expected: PASS with the controller handling submit, status SSE, and history refresh.

**Step 5: Commit**

```bash
git add src/renderer/src/features/group/group-workspaces-query.ts src/renderer/src/features/group/group-threads-query.ts src/renderer/src/features/group/group-chat-query.ts src/renderer/src/features/group/group-status-stream.ts src/renderer/src/features/group/group-thread-events-stream.ts src/renderer/src/features/group/group-queries.test.ts src/renderer/src/features/group/hooks/use-group-page-controller.ts src/renderer/src/features/group/hooks/use-group-page-controller.test.tsx
git commit -m "feat: add group renderer data layer"
```

### Task 7: Build the Group Page and Minimal Room UI

**Files:**
- Create: `src/renderer/src/features/group/components/group-sidebar.tsx`
- Test: `src/renderer/src/features/group/components/group-sidebar.test.tsx`
- Create: `src/renderer/src/features/group/components/group-chat-card.tsx`
- Test: `src/renderer/src/features/group/components/group-chat-card.test.tsx`
- Create: `src/renderer/src/features/group/components/group-message-list.tsx`
- Create: `src/renderer/src/features/group/components/group-config-dialog.tsx`
- Test: `src/renderer/src/features/group/components/group-config-dialog.test.tsx`
- Create: `src/renderer/src/features/group/pages/group-page.tsx`
- Test: `src/renderer/src/features/group/group-page.test.tsx`

**Step 1: Write the failing page/component tests**

```tsx
it('renders the group shell and room transcript', () => {
  const html = renderToString(
    <MemoryRouter initialEntries={['/group']}>
      <GroupPage />
    </MemoryRouter>
  )

  expect(html).toContain('Group Workspaces')
  expect(html).toContain('Group Chat')
  expect(html).toContain('data-group-page-shell="true"')
})
```

```tsx
it('shows assistant author labels and a typing indicator', () => {
  render(
    <GroupChatCard
      messages={[
        {
          id: 'msg-1',
          role: 'assistant',
          authorName: 'Planner',
          authorType: 'assistant',
          content: 'I can outline the rollout.'
        }
      ]}
      isAgentTyping={true}
      activeSpeakerName="Researcher"
      /* remaining props */
    />
  )

  expect(screen.getByText('Planner')).toBeInTheDocument()
  expect(screen.getByText(/Researcher is thinking/i)).toBeInTheDocument()
})
```

**Step 2: Run the Group UI tests to verify they fail**

Run: `pnpm test -- src/renderer/src/features/group/group-page.test.tsx src/renderer/src/features/group/components/group-sidebar.test.tsx src/renderer/src/features/group/components/group-chat-card.test.tsx src/renderer/src/features/group/components/group-config-dialog.test.tsx`

Expected: FAIL because the new Group page and components do not exist.

**Step 3: Implement the minimal Group UI**

```tsx
type GroupChatCardProps = {
  selectedWorkspace: GroupWorkspaceRecord | null
  selectedThread: GroupThreadRecord | null
  messages: GroupRoomMessageRecord[]
  members: AssistantRecord[]
  isAgentTyping: boolean
  activeSpeakerName: string | null
  onSubmitMessage: (messageText: string) => Promise<void>
  onOpenConfig: () => void
}
```

UI notes:
- Reuse the Team shell proportions so the new page feels native.
- Keep every room message left-aligned, but clearly label `You`, assistant names, and system/orchestrator entries.
- Render `@mentions` as visible inline text first; do not build a rich mention composer in v1.
- Add a small footer line like `Researcher is thinking...` when the latest status event says a turn is active.
- Keep the config dialog lightweight: workspace path, group description, max auto turns, and member selection.

**Step 4: Run the Group UI tests again**

Run: `pnpm test -- src/renderer/src/features/group/group-page.test.tsx src/renderer/src/features/group/components/group-sidebar.test.tsx src/renderer/src/features/group/components/group-chat-card.test.tsx src/renderer/src/features/group/components/group-config-dialog.test.tsx`

Expected: PASS with the new page shell and minimal room UI rendered.

**Step 5: Commit**

```bash
git add src/renderer/src/features/group/components/group-sidebar.tsx src/renderer/src/features/group/components/group-sidebar.test.tsx src/renderer/src/features/group/components/group-chat-card.tsx src/renderer/src/features/group/components/group-chat-card.test.tsx src/renderer/src/features/group/components/group-message-list.tsx src/renderer/src/features/group/components/group-config-dialog.tsx src/renderer/src/features/group/components/group-config-dialog.test.tsx src/renderer/src/features/group/pages/group-page.tsx src/renderer/src/features/group/group-page.test.tsx
git commit -m "feat: add group page ui"
```

### Task 8: Wire the Group Tab into Navigation, Routing, and Copy

**Files:**
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`
- Modify: `src/renderer/src/app/layout/studio-sidebar.tsx`
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `src/renderer/src/i18n/locales/zh-CN.json`
- Modify: `src/renderer/src/i18n/locales/zh-HK.json`
- Modify: `src/renderer/src/i18n/locales/ja-JP.json`
- Modify: `src/renderer/src/i18n/locales/de-DE.json`
- Modify: `src/renderer/src/i18n/locales/fr-FR.json`
- Modify: `src/renderer/src/i18n/locales/es-ES.json`
- Modify: `src/renderer/src/i18n/locales/pt-PT.json`
- Modify: `src/renderer/src/i18n/locales/ro-RO.json`
- Modify: `src/renderer/src/i18n/locales/el-GR.json`
- Modify: `src/renderer/src/i18n/locales/ru-RU.json`

**Step 1: Write the failing router/sidebar tests**

```tsx
it('registers the /group route', () => {
  const router = createAppMemoryRouter(['/group'])
  expect(router.state.location.pathname).toBe('/group')
})

it('shows Group in the legacy workspace sidebar', () => {
  const html = renderToString(
    <MemoryRouter initialEntries={['/group']}>
      <StudioSidebar />
    </MemoryRouter>
  )

  expect(html).toContain('Group')
})
```

**Step 2: Run the route/sidebar tests to verify they fail**

Run: `pnpm test -- src/renderer/src/app/router.test.tsx src/renderer/src/app/layout/app-shell.test.tsx`

Expected: FAIL because the router and sidebar do not know about the Group page yet.

**Step 3: Add the Group route, nav item, and strings**

```tsx
{
  path: 'group/:workspaceId?/:threadId?',
  element: <GroupPage />
}
```

```ts
const workspaceItems: SidebarItem[] = [
  { titleKey: 'appShell.legacySidebar.chat', to: '/chat', icon: Bot },
  { titleKey: 'appShell.legacySidebar.group', to: '/group', icon: Users },
  { titleKey: 'appShell.legacySidebar.team', to: '/team', icon: MessagesSquare }
]
```

Copy notes:
- Add a new `group` namespace parallel to the existing `team` strings.
- It is fine for non-English locales to start with copied English placeholders in the first shipping commit if that avoids missing-key regressions.

**Step 4: Run the route/sidebar tests again**

Run: `pnpm test -- src/renderer/src/app/router.test.tsx src/renderer/src/app/layout/app-shell.test.tsx`

Expected: PASS with `/group` routable and the sidebar link visible.

**Step 5: Commit**

```bash
git add src/renderer/src/app/router.tsx src/renderer/src/app/router.test.tsx src/renderer/src/app/layout/studio-sidebar.tsx src/renderer/src/i18n/locales/en-US.json src/renderer/src/i18n/locales/zh-CN.json src/renderer/src/i18n/locales/zh-HK.json src/renderer/src/i18n/locales/ja-JP.json src/renderer/src/i18n/locales/de-DE.json src/renderer/src/i18n/locales/fr-FR.json src/renderer/src/i18n/locales/es-ES.json src/renderer/src/i18n/locales/pt-PT.json src/renderer/src/i18n/locales/ro-RO.json src/renderer/src/i18n/locales/el-GR.json src/renderer/src/i18n/locales/ru-RU.json
git commit -m "feat: add group tab and routing"
```

### Task 9: Run the Focused Regression Suite

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/features/group/**/*`

**Step 1: Run the focused backend regression set**

Run: `pnpm test -- src/main/persistence/repos/group-workspaces-repo.test.ts src/main/persistence/repos/group-threads-repo.test.ts src/main/server/routes/group-workspaces-route.test.ts src/main/server/routes/group-threads-route.test.ts src/main/groups/group-event-bus.test.ts src/main/server/chat/group-run-status-store.test.ts src/main/server/chat/group-thread-events-store.test.ts src/main/mastra/tools/group-tools.test.ts src/main/mastra/assistant-runtime.test.ts src/main/groups/group-turn-selector.test.ts src/main/groups/group-run-router.test.ts src/main/mastra/group-runtime.test.ts src/main/server/routes/group-chat-route.test.ts`

Expected: PASS for the new group backend slice.

**Step 2: Run the focused renderer regression set**

Run: `pnpm test -- src/renderer/src/features/group/group-queries.test.ts src/renderer/src/features/group/hooks/use-group-page-controller.test.tsx src/renderer/src/features/group/group-page.test.tsx src/renderer/src/features/group/components/group-sidebar.test.tsx src/renderer/src/features/group/components/group-chat-card.test.tsx src/renderer/src/features/group/components/group-config-dialog.test.tsx src/renderer/src/app/router.test.tsx`

Expected: PASS for the new group renderer slice.

**Step 3: Run one broader smoke suite touching adjacent features**

Run: `pnpm test -- src/main/server/routes/team-chat-route.test.ts src/main/mastra/team-runtime.test.ts src/renderer/src/features/team/team-queries.test.ts src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/main/server/routes/chat-route.test.ts`

Expected: PASS to confirm the new group work did not regress Team or direct assistant chat surfaces.

**Step 4: Commit the green integrated feature**

```bash
git add src/main/index.ts src/main/server/create-app.ts src/renderer/src/app/router.tsx src/renderer/src/features/group
git commit -m "feat: ship group runtime and group tab"
```

## Notes for Execution

- Keep the first shipped scheduler deterministic and cheap: mentions first, then follow-up, then round-robin.
- Reuse `ThreadsRepository` for assistant-private subthreads and `AssistantRuntimeService` for actual agent execution.
- Do not use the Team supervisor pattern in v1. The whole point of this feature is to let assistants talk in a shared room without a single content-producing boss.
- Keep the Group renderer intentionally simple. History fetch + status SSE + message SSE is enough for the first version.
- If you need an extension point for later, add `selectionMode` to group workspace config but do not implement arbiter/delegation logic in the MVP.
