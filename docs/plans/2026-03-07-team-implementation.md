# Team Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a new `Team` surface with manual Team workspaces, Team threads, per-thread supervisor configuration, live assistant-member references, and a streamed Team execution status panel.

**Architecture:** Add a separate Team persistence and runtime path instead of extending the existing assistant chat path in place. Team chat resolves live assistant members into a dynamic Mastra supervisor agent per run, overrides all member workspaces with the selected Team workspace at runtime, streams chat output in AI SDK format, and streams status events in parallel for the Team graph.

**Tech Stack:** Electron, React 19, React Router, Vitest, Hono, SQLite/libSQL, Mastra `Agent.stream()`, `@mastra/ai-sdk`, AI SDK `useChat`, and `@xyflow/react`.

---

### Task 1: Add Team schema and repositories

**Files:**
- Modify: `src/main/persistence/migrations/0001_app_core.sql`
- Modify: `src/main/persistence/migrations/0001_app_core.ts`
- Modify: `src/main/persistence/migrate.ts`
- Create: `src/main/persistence/repos/team-workspaces-repo.ts`
- Create: `src/main/persistence/repos/team-threads-repo.ts`
- Create: `src/main/persistence/repos/team-workspaces-repo.test.ts`
- Create: `src/main/persistence/repos/team-threads-repo.test.ts`

**Step 1: Write the failing tests**

Create repository tests covering:

- Team workspace create/list/update/delete
- Team thread create/list/update/delete
- Team member replacement with stable `sortOrder`
- Cascading delete from Team workspace to Team threads and Team-thread members

Test sketch for `src/main/persistence/repos/team-workspaces-repo.test.ts`:

```ts
it('creates and lists team workspaces', async () => {
  const db = await migrateAppSchema(':memory:')
  const repo = new TeamWorkspacesRepository(db)

  await repo.create({
    name: 'Docs Workspace',
    rootPath: '/Users/demo/project'
  })

  const workspaces = await repo.list()

  expect(workspaces).toHaveLength(1)
  expect(workspaces[0]).toMatchObject({
    name: 'Docs Workspace',
    rootPath: '/Users/demo/project'
  })
})
```

Test sketch for `src/main/persistence/repos/team-threads-repo.test.ts`:

```ts
it('replaces team thread members in order', async () => {
  const thread = await repo.create({
    workspaceId,
    resourceId: 'default-profile',
    title: 'Release team'
  })

  await repo.replaceMembers(thread.id, ['assistant-2', 'assistant-1'])

  const members = await repo.listMembers(thread.id)
  expect(members.map((member) => member.assistantId)).toEqual(['assistant-2', 'assistant-1'])
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/main/persistence/repos/team-workspaces-repo.test.ts src/main/persistence/repos/team-threads-repo.test.ts`

Expected: FAIL because the Team tables and repositories do not exist yet.

**Step 3: Write the minimal implementation**

- Add `app_team_workspaces`, `app_team_threads`, and `app_team_thread_members` to both core migration sources.
- In `src/main/persistence/migrate.ts`, add `ensureTeamTables(db)` so existing databases gain the new tables safely.
- Implement:
  - `TeamWorkspacesRepository`
  - `TeamThreadsRepository`
- Keep the repository API small:

```ts
type CreateTeamWorkspaceInput = {
  name: string
  rootPath: string
}

type CreateTeamThreadInput = {
  workspaceId: string
  resourceId: string
  title: string
}
```

- In `TeamThreadsRepository`, expose:
  - `listByWorkspace(workspaceId)`
  - `getById(id)`
  - `create(input)`
  - `update(id, input)`
  - `delete(id)`
  - `listMembers(threadId)`
  - `replaceMembers(threadId, assistantIds)`
  - `touchLastMessageAt(id, timestamp)`

**Step 4: Re-run tests to verify they pass**

Run: `pnpm vitest run src/main/persistence/repos/team-workspaces-repo.test.ts src/main/persistence/repos/team-threads-repo.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/persistence/migrations/0001_app_core.sql src/main/persistence/migrations/0001_app_core.ts src/main/persistence/migrate.ts src/main/persistence/repos/team-workspaces-repo.ts src/main/persistence/repos/team-threads-repo.ts src/main/persistence/repos/team-workspaces-repo.test.ts src/main/persistence/repos/team-threads-repo.test.ts
git commit -m "feat: add team persistence layer"
```

---

### Task 2: Add Team validators and REST routes

**Files:**
- Create: `src/main/server/validators/team-validator.ts`
- Create: `src/main/server/routes/team-workspaces-route.ts`
- Create: `src/main/server/routes/team-threads-route.ts`
- Create: `src/main/server/routes/team-workspaces-route.test.ts`
- Create: `src/main/server/routes/team-threads-route.test.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing route tests**

Create route tests covering:

- create/list/update/delete Team workspaces
- create/list/update/delete Team threads
- replace Team thread members
- validation errors for blank names, missing workspace IDs, and duplicate member IDs
- 404 responses for unknown Team workspaces and Team threads

Test sketch:

```ts
it('updates team thread members', async () => {
  const response = await app.request(`/v1/team/threads/${threadId}/members`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      assistantIds: ['assistant-2', 'assistant-1']
    })
  })

  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.members.map((member: { assistantId: string }) => member.assistantId)).toEqual([
    'assistant-2',
    'assistant-1'
  ])
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/main/server/routes/team-workspaces-route.test.ts src/main/server/routes/team-threads-route.test.ts`

Expected: FAIL because the Team routes and validators are not registered.

**Step 3: Write the minimal implementation**

- Add Zod schemas in `src/main/server/validators/team-validator.ts`:
  - `createTeamWorkspaceSchema`
  - `updateTeamWorkspaceSchema`
  - `createTeamThreadSchema`
  - `updateTeamThreadSchema`
  - `replaceTeamThreadMembersSchema`
- Implement Team routes:
  - `registerTeamWorkspacesRoute`
  - `registerTeamThreadsRoute`
- Wire the repositories into `createApp(...)` and instantiate them in `src/main/index.ts`.
- Route response shapes should stay consistent with existing API style:

```ts
return context.json({
  ...thread,
  members
})
```

**Step 4: Re-run tests to verify they pass**

Run: `pnpm vitest run src/main/server/routes/team-workspaces-route.test.ts src/main/server/routes/team-threads-route.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/server/validators/team-validator.ts src/main/server/routes/team-workspaces-route.ts src/main/server/routes/team-threads-route.ts src/main/server/routes/team-workspaces-route.test.ts src/main/server/routes/team-threads-route.test.ts src/main/server/create-app.ts src/main/index.ts
git commit -m "feat: add team REST routes"
```

---

### Task 3: Build Team runtime and Team chat endpoints

**Files:**
- Create: `src/main/mastra/team-runtime.ts`
- Create: `src/main/mastra/team-runtime.test.ts`
- Create: `src/main/server/chat/team-run-status-store.ts`
- Create: `src/main/server/routes/team-chat-route.ts`
- Create: `src/main/server/routes/team-chat-route.test.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing runtime and route tests**

Cover:

- Team runtime resolves live assistant members
- Team runtime applies the Team workspace override instead of assistant workspace paths
- Team runtime rejects invalid Team thread configuration
- Team runtime emits status events during delegation
- Team chat history reads persisted Mastra memory for Team thread IDs

Runtime test sketch:

```ts
it('overrides member workspaces with the team workspace root path', async () => {
  const runtime = new TeamRuntimeService({
    mastra,
    assistantsRepo,
    providersRepo,
    teamWorkspacesRepo,
    teamThreadsRepo,
    threadsRepo,
    webSearchSettingsRepo,
    mcpServersRepo
  })

  await runtime.streamTeamChat({
    threadId: 'team-thread-1',
    profileId: 'default-profile',
    messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'ship it' }] }]
  })

  expect(buildWorkspaceSpy).toHaveBeenCalledWith(
    expect.objectContaining({ rootPath: '/team/workspace' })
  )
})
```

Route test sketch:

```ts
it('returns status events for an active run', async () => {
  const response = await app.request('/team-chat/thread-1/runs/run-1/status', {
    method: 'GET',
    headers: authHeaders
  })

  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/event-stream')
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/main/mastra/team-runtime.test.ts src/main/server/routes/team-chat-route.test.ts`

Expected: FAIL because Team runtime and Team chat routes do not exist.

**Step 3: Write the minimal implementation**

- Create `TeamRuntimeService` with:
  - `streamTeamChat(params)`
  - `listTeamThreadMessages(params)`
- Resolve the Team thread, Team workspace, supervisor provider, and live assistant members.
- Build member agents dynamically from live assistant records.
- Build the supervisor agent dynamically using the Team-thread description plus selected members:

```ts
const supervisor = new Agent({
  id: `team-supervisor:${thread.id}`,
  name: 'Team Supervisor',
  instructions: supervisorInstructions,
  model,
  agents: memberAgents,
  memory
})
```

- Call `supervisor.stream(...)`, then convert the result with `toAISdkV5Stream(stream, { from: 'agent', sendReasoning: true })`.
- Emit Team status events from:
  - `delegation.onDelegationStart`
  - `delegation.onDelegationComplete`
  - `onIterationComplete`
- Add a small in-memory `TeamRunStatusStore` keyed by `runId` to let the status route stream new events to the renderer.
- In `team-chat-route.ts`, add:
  - `GET /team-chat/:threadId/history`
  - `POST /team-chat/:threadId`
  - `GET /team-chat/:threadId/runs/:runId/status`

**Step 4: Re-run tests to verify they pass**

Run: `pnpm vitest run src/main/mastra/team-runtime.test.ts src/main/server/routes/team-chat-route.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/team-runtime.ts src/main/mastra/team-runtime.test.ts src/main/server/chat/team-run-status-store.ts src/main/server/routes/team-chat-route.ts src/main/server/routes/team-chat-route.test.ts src/main/server/create-app.ts src/main/index.ts
git commit -m "feat: add team runtime and team chat routes"
```

---

### Task 4: Add Team renderer data and streaming utilities

**Files:**
- Create: `src/renderer/src/features/team/team-workspaces-query.ts`
- Create: `src/renderer/src/features/team/team-threads-query.ts`
- Create: `src/renderer/src/features/team/team-chat-query.ts`
- Create: `src/renderer/src/features/team/team-status-stream.ts`
- Create: `src/renderer/src/features/team/team-queries.test.ts`

**Step 1: Write the failing tests**

Cover:

- Team workspace and Team thread CRUD query helpers call the correct endpoints.
- Team chat transport posts to `/team-chat/:threadId`.
- Team status stream uses authenticated `fetch`, not `EventSource`.

Test sketch:

```ts
it('opens the team status stream with authorization headers', async () => {
  const fetchMock = vi.fn().mockResolvedValue(streamingResponse)
  vi.stubGlobal('fetch', fetchMock)

  await openTeamStatusStream({
    threadId: 'thread-1',
    runId: 'run-1',
    onEvent: vi.fn()
  })

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/team-chat/thread-1/runs/run-1/status'),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: expect.stringContaining('Bearer ')
      })
    })
  )
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/src/features/team/team-queries.test.ts`

Expected: FAIL because the Team renderer data layer does not exist.

**Step 3: Write the minimal implementation**

- Add Team query helpers for workspaces and Team threads using `createApiClient()`.
- Add Team chat transport mirroring the existing `createThreadChatTransport(...)`, but targeting Team endpoints.
- Add `openTeamStatusStream(...)` using authenticated `fetch` plus `ReadableStream` parsing:

```ts
const response = await fetch(url, {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${config.authToken}`
  }
})
```

- Parse server events into a small union type such as:

```ts
type TeamStatusEvent =
  | { type: 'run-started'; runId: string }
  | { type: 'delegation-started'; runId: string; assistantId: string }
  | { type: 'delegation-finished'; runId: string; assistantId: string; outcome: 'done' | 'error' }
```

**Step 4: Re-run tests to verify they pass**

Run: `pnpm vitest run src/renderer/src/features/team/team-queries.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/team/team-workspaces-query.ts src/renderer/src/features/team/team-threads-query.ts src/renderer/src/features/team/team-chat-query.ts src/renderer/src/features/team/team-status-stream.ts src/renderer/src/features/team/team-queries.test.ts
git commit -m "feat: add team renderer data layer"
```

---

### Task 5: Add Team routing, nav, and page shell

**Files:**
- Modify: `package.json`
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`
- Modify: `src/renderer/src/app/layout/app-shell.tsx`
- Modify: `src/renderer/src/app/layout/app-shell.test.tsx`
- Create: `src/renderer/src/features/team/pages/team-page.tsx`
- Create: `src/renderer/src/features/team/team-page.test.tsx`

**Step 1: Write the failing tests**

Update routing and shell tests to assert:

- `Team` appears in the top nav
- `/team` renders the Team page
- the Team page uses a three-column layout shell

Test sketch:

```ts
it('renders the team route from the top nav', () => {
  const router = createAppMemoryRouter(['/team'])
  const html = renderToString(<RouterProvider router={router} />)

  expect(html).toContain('Team')
  expect(html).toContain('Team Workspaces')
  expect(html).toContain('Team Status')
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/src/app/router.test.tsx src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/features/team/team-page.test.tsx`

Expected: FAIL because the Team route and Team page do not exist.

**Step 3: Write the minimal implementation**

- Add `@xyflow/react` to `package.json`.
- Register `/team/:workspaceId?/:threadId?` in `src/renderer/src/app/router.tsx`.
- Add a `Team` button to the header in `src/renderer/src/app/layout/app-shell.tsx`.
- Create `TeamPage` with a three-column shell and placeholder sections:

```tsx
<section className="flex h-[calc(100vh-3.5rem)] min-h-[650px] min-w-[960px]">
  <aside className="w-1/3">...</aside>
  <div className="w-1/3">...</div>
  <aside className="w-1/3">...</aside>
</section>
```

**Step 4: Re-run tests to verify they pass**

Run: `pnpm vitest run src/renderer/src/app/router.test.tsx src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/features/team/team-page.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add package.json src/renderer/src/app/router.tsx src/renderer/src/app/router.test.tsx src/renderer/src/app/layout/app-shell.tsx src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/features/team/pages/team-page.tsx src/renderer/src/features/team/team-page.test.tsx
git commit -m "feat: add team route and page shell"
```

---

### Task 6: Add Team sidebar, controller, and configuration dialog

**Files:**
- Create: `src/renderer/src/features/team/hooks/use-team-page-controller.ts`
- Create: `src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx`
- Create: `src/renderer/src/features/team/components/team-sidebar.tsx`
- Create: `src/renderer/src/features/team/components/team-sidebar.test.tsx`
- Create: `src/renderer/src/features/team/components/team-config-dialog.tsx`
- Create: `src/renderer/src/features/team/components/team-config-dialog.test.tsx`
- Modify: `src/renderer/src/features/team/pages/team-page.tsx`

**Step 1: Write the failing tests**

Cover:

- Team workspace selection
- Team thread selection
- Team workspace creation action
- Team thread creation action
- Team config dialog validation for missing supervisor settings and empty member list
- setup blockers when a Team thread is incomplete

Controller test sketch:

```ts
it('blocks send when the team thread has no members', async () => {
  const controller = renderHook(() => useTeamPageController(), { wrapper })
  expect(controller.result.current.readiness.canChat).toBe(false)
  expect(controller.result.current.readiness.checks.map(check => check.id)).toContain('members')
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/components/team-sidebar.test.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx`

Expected: FAIL because the Team controller and Team UI components do not exist.

**Step 3: Write the minimal implementation**

- Build `useTeamPageController()` to load:
  - Team workspaces
  - Team threads for the selected workspace
  - Team-thread member state
  - assistants/providers for Team configuration
- Reuse the existing assistant config patterns where it fits, but keep Team-specific state separate.
- Add `TeamSidebar` with:
  - workspace list
  - per-workspace Team thread list
  - `New Workspace`
  - `New Team Thread`
- Add `TeamConfigDialog` with:
  - Team thread title
  - Team description
  - supervisor provider
  - supervisor model
  - multi-select Team members

**Step 4: Re-run tests to verify they pass**

Run: `pnpm vitest run src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/components/team-sidebar.test.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/team/hooks/use-team-page-controller.ts src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/components/team-sidebar.tsx src/renderer/src/features/team/components/team-sidebar.test.tsx src/renderer/src/features/team/components/team-config-dialog.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx src/renderer/src/features/team/pages/team-page.tsx
git commit -m "feat: add team sidebar and config dialog"
```

---

### Task 7: Add Team chat card and Team status graph

**Files:**
- Create: `src/renderer/src/features/team/components/team-chat-card.tsx`
- Create: `src/renderer/src/features/team/components/team-chat-card.test.tsx`
- Create: `src/renderer/src/features/team/components/team-status-graph.tsx`
- Create: `src/renderer/src/features/team/components/team-status-graph.test.tsx`
- Modify: `src/renderer/src/features/team/pages/team-page.tsx`
- Modify: `src/renderer/src/features/team/hooks/use-team-page-controller.ts`

**Step 1: Write the failing tests**

Cover:

- Team chat card renders Team-thread metadata and blocks send when setup is incomplete
- Team status graph maps streamed events to supervisor/member node state
- event log renders delegation progress text

Graph test sketch:

```ts
it('marks a member node running after delegation-started', () => {
  render(
    <TeamStatusGraph
      assistants={[{ id: 'assistant-1', name: 'Planner' }]}
      events={[
        { type: 'delegation-started', runId: 'run-1', assistantId: 'assistant-1' }
      ]}
    />
  )

  expect(screen.getByText('Planner')).toHaveAttribute('data-state', 'running')
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/src/features/team/components/team-chat-card.test.tsx src/renderer/src/features/team/components/team-status-graph.test.tsx`

Expected: FAIL because the Team chat/status components do not exist.

**Step 3: Write the minimal implementation**

- Add `TeamChatCard` reusing the existing thread-chat feel:
  - title/header metadata
  - composer
  - message history
  - send/stop controls
- Hook it to Team chat transport plus Team status stream subscription.
- Add `TeamStatusGraph` using `@xyflow/react`:
  - central supervisor node
  - member nodes around it
  - event log below or beside the graph
- Keep the first pass deliberately simple: deterministic layout, status color changes, no drag persistence.

**Step 4: Re-run tests to verify they pass**

Run: `pnpm vitest run src/renderer/src/features/team/components/team-chat-card.test.tsx src/renderer/src/features/team/components/team-status-graph.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/team/components/team-chat-card.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx src/renderer/src/features/team/components/team-status-graph.tsx src/renderer/src/features/team/components/team-status-graph.test.tsx src/renderer/src/features/team/pages/team-page.tsx src/renderer/src/features/team/hooks/use-team-page-controller.ts
git commit -m "feat: add team chat and status graph"
```

---

### Task 8: Verify the full Team slice

**Files:**
- Modify: `src/renderer/src/app/router.test.tsx`
- Modify: `src/main/server/routes/team-chat-route.test.ts`
- Modify: `src/main/mastra/team-runtime.test.ts`
- Modify: `src/renderer/src/features/team/team-page.test.tsx`

**Step 1: Add the final end-to-end-ish smoke tests**

Add one last set of focused tests that prove the vertical slice works together:

- renderer route renders Team shell
- controller blocks send when Team config is incomplete
- Team chat route rejects invalid Team threads
- Team runtime emits at least one status event for a valid run

**Step 2: Run targeted tests**

Run: `pnpm vitest run src/main/persistence/repos/team-workspaces-repo.test.ts src/main/persistence/repos/team-threads-repo.test.ts src/main/server/routes/team-workspaces-route.test.ts src/main/server/routes/team-threads-route.test.ts src/main/server/routes/team-chat-route.test.ts src/main/mastra/team-runtime.test.ts src/renderer/src/app/router.test.tsx src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/features/team/team-page.test.tsx src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/components/team-sidebar.test.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx src/renderer/src/features/team/components/team-status-graph.test.tsx`

Expected: PASS

**Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS

**Step 4: Run the full test suite**

Run: `pnpm test`

Expected: PASS, or only unrelated pre-existing failures.

**Step 5: Commit**

```bash
git add src/main src/renderer/src package.json
git commit -m "feat: add team feature"
```
