# Team Workspace-Owned Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move team configuration to workspace ownership, open team configuration as soon as a workspace is created, adopt the collapsible Codex-style team sidebar, and auto-generate team thread titles from supervisor memory.

**Architecture:** Extend `app_team_workspaces` with team configuration fields and add `app_team_workspace_members` as the live roster source. Keep `app_team_threads` focused on conversations, migrate runtime/readiness to read from the workspace, and refactor the renderer so team configuration is available whenever a workspace is active. Reuse the existing assistant sidebar primitives for the collapsible workspace/thread hierarchy and sync generated team thread titles back from Mastra memory after successful runs.

**Tech Stack:** Electron, React 19, React Router, Vitest, Hono, SQLite/libSQL, Mastra `Agent.stream()`, `@mastra/memory`, AI SDK `useChat`, and the existing `src/renderer/src/components/ui/sidebar.tsx` primitives.

---

### Task 1: Move team ownership into workspace persistence

**Files:**

- Modify: `src/main/persistence/migrations/0001_app_core.sql`
- Modify: `src/main/persistence/migrations/0001_app_core.ts`
- Modify: `src/main/persistence/migrate.ts`
- Modify: `src/main/persistence/migrate.test.ts`
- Modify: `src/main/persistence/migrate-fallback.test.ts`
- Modify: `src/main/persistence/repos/team-workspaces-repo.ts`
- Modify: `src/main/persistence/repos/team-workspaces-repo.test.ts`
- Modify: `src/main/persistence/repos/team-threads-repo.ts`
- Modify: `src/main/persistence/repos/team-threads-repo.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- workspace config fields (`teamDescription`, `supervisorProviderId`, `supervisorModel`)
- workspace member storage and ordering
- thread creation without config fields
- migration/backfill creating `app_team_workspace_members`

Test sketch:

```ts
it('stores workspace-owned supervisor configuration', async () => {
  const workspace = await repo.create({
    name: 'Docs Workspace',
    rootPath: '/Users/demo/project'
  })

  const updated = await repo.update(workspace.id, {
    teamDescription: 'Coordinate docs release',
    supervisorProviderId: 'provider-1',
    supervisorModel: 'gpt-5'
  })

  expect(updated).toMatchObject({
    teamDescription: 'Coordinate docs release',
    supervisorProviderId: 'provider-1',
    supervisorModel: 'gpt-5'
  })
})
```

**Step 2: Run the persistence tests to verify they fail**

Run:

```bash
npm run test -- src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/persistence/repos/team-workspaces-repo.test.ts src/main/persistence/repos/team-threads-repo.test.ts
```

Expected: FAIL because the workspace config columns, workspace-members table, and repo methods do not exist yet.

**Step 3: Write the minimal implementation**

- Add workspace-owned config columns to `app_team_workspaces`.
- Add `app_team_workspace_members`.
- Make `ensureTeamTables(db)` idempotently add missing columns and backfill data from existing configured threads.
- Expand `TeamWorkspacesRepository`:

```ts
export type UpdateTeamWorkspaceInput = {
  name?: string
  rootPath?: string
  teamDescription?: string
  supervisorProviderId?: string | null
  supervisorModel?: string
}
```

- Add:
  - `listMembers(workspaceId)`
  - `replaceMembers(workspaceId, assistantIds)`
- Simplify `TeamThreadsRepository` so threads no longer expose team-owned config as active behavior.

**Step 4: Re-run the persistence tests to verify they pass**

Run:

```bash
npm run test -- src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/persistence/repos/team-workspaces-repo.test.ts src/main/persistence/repos/team-threads-repo.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/persistence/migrations/0001_app_core.sql src/main/persistence/migrations/0001_app_core.ts src/main/persistence/migrate.ts src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/persistence/repos/team-workspaces-repo.ts src/main/persistence/repos/team-workspaces-repo.test.ts src/main/persistence/repos/team-threads-repo.ts src/main/persistence/repos/team-threads-repo.test.ts
git commit -m "refactor: move team config to workspaces"
```

---

### Task 2: Move API and renderer contracts to workspace-level team config

**Files:**

- Modify: `src/main/server/validators/team-validator.ts`
- Modify: `src/main/server/routes/team-workspaces-route.ts`
- Modify: `src/main/server/routes/team-workspaces-route.test.ts`
- Modify: `src/main/server/routes/team-threads-route.ts`
- Modify: `src/main/server/routes/team-threads-route.test.ts`
- Modify: `src/renderer/src/features/team/team-workspaces-query.ts`
- Modify: `src/renderer/src/features/team/team-threads-query.ts`
- Modify: `src/renderer/src/features/team/team-queries.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- patching workspace-owned team config
- listing and replacing workspace members
- creating team threads without a title input
- renderer query helpers calling workspace member endpoints instead of thread member endpoints

Test sketch:

```ts
await expect(replaceTeamWorkspaceMembers('workspace-1', ['assistant-2'])).resolves.toEqual([
  expect.objectContaining({
    workspaceId: 'workspace-1',
    assistantId: 'assistant-2'
  })
])
```

**Step 2: Run the contract tests to verify they fail**

Run:

```bash
npm run test -- src/main/server/routes/team-workspaces-route.test.ts src/main/server/routes/team-threads-route.test.ts src/renderer/src/features/team/team-queries.test.ts
```

Expected: FAIL because workspace member endpoints and thread-create contract changes are not implemented yet.

**Step 3: Write the minimal implementation**

- Extend `updateTeamWorkspaceSchema` with team config fields.
- Add workspace member schemas and routes:
  - `GET /v1/team/workspaces/:workspaceId/members`
  - `PUT /v1/team/workspaces/:workspaceId/members`
- Narrow thread creation to:

```ts
export type CreateTeamThreadInput = {
  workspaceId: string
  resourceId: string
}
```

- Default new thread titles to `''` on the server.
- Remove renderer dependency on `listTeamThreadMembers` and `replaceTeamThreadMembers`.

**Step 4: Re-run the contract tests to verify they pass**

Run:

```bash
npm run test -- src/main/server/routes/team-workspaces-route.test.ts src/main/server/routes/team-threads-route.test.ts src/renderer/src/features/team/team-queries.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/server/validators/team-validator.ts src/main/server/routes/team-workspaces-route.ts src/main/server/routes/team-workspaces-route.test.ts src/main/server/routes/team-threads-route.ts src/main/server/routes/team-threads-route.test.ts src/renderer/src/features/team/team-workspaces-query.ts src/renderer/src/features/team/team-threads-query.ts src/renderer/src/features/team/team-queries.test.ts
git commit -m "refactor: expose workspace-scoped team config APIs"
```

---

### Task 3: Shift runtime and title generation to workspace-owned team state

**Files:**

- Modify: `src/main/mastra/team-runtime.ts`
- Modify: `src/main/mastra/team-runtime.test.ts`
- Modify: `src/main/persistence/repos/team-workspaces-repo.ts`
- Modify: `src/main/persistence/repos/team-threads-repo.ts`
- Modify: `src/main/server/routes/team-chat-route.test.ts`

**Step 1: Write the failing runtime tests**

Add coverage for:

- runtime reading team description/provider/model from the workspace
- runtime reading members from workspace members
- readiness failures when workspace config is incomplete
- syncing generated thread titles back to `app_team_threads`

Test sketch:

```ts
it('syncs a generated team thread title after the first run', async () => {
  await runtime.streamTeamChat({
    threadId: thread.id,
    profileId: 'default-profile',
    messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Plan release' }] }]
  })

  await expect(teamThreadsRepo.getById(thread.id)).resolves.toMatchObject({
    title: 'Plan release checklist'
  })
})
```

**Step 2: Run the runtime tests to verify they fail**

Run:

```bash
npm run test -- src/main/mastra/team-runtime.test.ts src/main/server/routes/team-chat-route.test.ts
```

Expected: FAIL because `TeamRuntimeService` still reads thread config and never syncs generated team thread titles.

**Step 3: Write the minimal implementation**

- Resolve supervisor config from the workspace record.
- Resolve members from `app_team_workspace_members`.
- Mirror the assistant-runtime title-sync pattern:

```ts
if (this.shouldReplaceThreadTitle(appThread.title)) {
  const memoryThread = await memoryStore.getThreadById({ threadId: params.threadId })
  const generatedTitle = this.toNonEmptyString(memoryThread?.title)
  if (generatedTitle) {
    await this.options.teamThreadsRepo.updateTitle(params.threadId, generatedTitle)
  }
}
```

- Keep `generateTitle: true` in both `Memory` construction and per-run memory options.

**Step 4: Re-run the runtime tests to verify they pass**

Run:

```bash
npm run test -- src/main/mastra/team-runtime.test.ts src/main/server/routes/team-chat-route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/team-runtime.ts src/main/mastra/team-runtime.test.ts src/main/persistence/repos/team-workspaces-repo.ts src/main/persistence/repos/team-threads-repo.ts src/main/server/routes/team-chat-route.test.ts
git commit -m "refactor: run teams from workspace config"
```

---

### Task 4: Refactor the controller around workspace-scoped configuration

**Files:**

- Modify: `src/renderer/src/features/team/hooks/use-team-page-controller.ts`
- Modify: `src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx`
- Modify: `src/renderer/src/features/team/pages/team-page.tsx`
- Modify: `src/renderer/src/features/team/team-page.test.tsx`
- Modify: `src/renderer/src/features/team/components/team-chat-card.tsx`
- Modify: `src/renderer/src/features/team/components/team-config-dialog.tsx`
- Modify: `src/renderer/src/features/team/components/team-config-dialog.test.tsx`

**Step 1: Write the failing controller and dialog tests**

Add coverage for:

- opening `Configure Team` when only a workspace is selected
- auto-opening the config dialog after `handleCreateWorkspace`
- loading/saving selected members from workspace members
- creating a thread without a title field
- removing the thread title input from the dialog

Test sketch:

```ts
await act(async () => {
  await controller?.handleCreateWorkspace()
})

expect(controller?.selectedWorkspace?.id).toBe('workspace-2')
expect(controller?.isConfigDialogOpen).toBe(true)
```

**Step 2: Run the controller and dialog tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx src/renderer/src/features/team/team-page.test.tsx
```

Expected: FAIL because the controller still requires a selected thread for config and the dialog still renders `Thread Title`.

**Step 3: Write the minimal implementation**

- Load/save workspace config through `updateTeamWorkspace(...)`.
- Load/save members through workspace member query helpers.
- Open config immediately after workspace creation succeeds.
- Allow `openConfigDialog()` whenever `selectedWorkspace` exists.
- Remove the `title` field from `TeamConfigDialogValues`.
- Keep `New Team Thread` creation limited to workspace/thread creation only.

**Step 4: Re-run the controller and dialog tests to verify they pass**

Run:

```bash
npm run test -- src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx src/renderer/src/features/team/team-page.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/team/hooks/use-team-page-controller.ts src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/pages/team-page.tsx src/renderer/src/features/team/team-page.test.tsx src/renderer/src/features/team/components/team-chat-card.tsx src/renderer/src/features/team/components/team-config-dialog.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx
git commit -m "refactor: make team config workspace scoped"
```

---

### Task 5: Rebuild the sidebar with the existing collapsible thread pattern

**Files:**

- Modify: `src/renderer/src/features/team/components/team-sidebar.tsx`
- Modify: `src/renderer/src/features/team/components/team-sidebar.test.tsx`
- Reference: `src/renderer/src/features/threads/components/thread-sidebar.tsx`
- Reference: `src/renderer/src/components/ui/sidebar.tsx`

**Step 1: Write the failing sidebar tests**

Add coverage for:

- rendering workspaces as top-level collapsible items
- rendering threads as nested items under the selected workspace
- selecting a workspace before a thread
- keeping `New Workspace` and `New Team Thread` actions wired correctly

Test sketch:

```ts
expect(container.textContent).toContain('Docs Workspace')
expect(container.textContent).toContain('Release Team')
expect(container.querySelector('[aria-expanded="true"]')).not.toBeNull()
```

**Step 2: Run the sidebar tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/features/team/components/team-sidebar.test.tsx
```

Expected: FAIL because the sidebar still uses the card/list layout instead of the nested sidebar primitives.

**Step 3: Write the minimal implementation**

- Rebuild `TeamSidebar` with the same primitives used by the assistant thread sidebar:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton onClick={() => onSelectWorkspace(workspace.id)}>
    <Folder className="size-4" />
    <span>{workspace.name}</span>
  </SidebarMenuButton>
  {workspace.id === selectedWorkspaceId ? (
    <SidebarMenuSub>{/* nested thread items */}</SidebarMenuSub>
  ) : null}
</SidebarMenuItem>
```

- Keep behavior simple: selected workspace expands; threads render under it.

**Step 4: Re-run the sidebar tests and a focused UI regression pass**

Run:

```bash
npm run test -- src/renderer/src/features/team/components/team-sidebar.test.tsx src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx src/renderer/src/features/team/team-page.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/team/components/team-sidebar.tsx src/renderer/src/features/team/components/team-sidebar.test.tsx
git commit -m "feat: adopt collapsible team sidebar"
```

---

### Task 6: Verify the full feature before handoff

**Files:**

- Modify as needed: only files touched by failing tests from Tasks 1-5

**Step 1: Run the focused end-to-end feature suite**

Run:

```bash
npm run test -- src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/persistence/repos/team-workspaces-repo.test.ts src/main/persistence/repos/team-threads-repo.test.ts src/main/server/routes/team-workspaces-route.test.ts src/main/server/routes/team-threads-route.test.ts src/main/server/routes/team-chat-route.test.ts src/main/mastra/team-runtime.test.ts src/renderer/src/features/team/team-queries.test.ts src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx src/renderer/src/features/team/components/team-sidebar.test.tsx src/renderer/src/features/team/team-page.test.tsx
```

Expected: PASS

**Step 2: Run static verification**

Run:

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Run the broader team-area regression pass**

Run:

```bash
npm run test -- src/renderer/src/features/team src/main/server/routes src/main/mastra/team-runtime.test.ts
```

Expected: PASS

**Step 4: Fix only regressions caused by this feature**

- Do not widen scope beyond team ownership, sidebar structure, dialog flow, and title generation.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: improve workspace-owned team flow"
```
