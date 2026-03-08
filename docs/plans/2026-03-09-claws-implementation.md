# Claws Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an assistant-centric `Claws` experience that lets users create or manage assistants, attach one of multiple Lark channels, and activate external runtime behavior from a single top-nav page.

**Architecture:** Keep assistants as the core domain record and add `enabled` to represent claw activation. Add a new orchestration API that joins assistants and channels for the renderer, while refactoring channel runtime to start only for channels attached to enabled assistants. Replace the legacy single-channel settings surface with a new `/claws` page and a compatibility redirect from `/settings/channels`.

**Tech Stack:** Electron, React 19, React Router, TanStack Query, Hono, SQLite/libsql, Vitest, TypeScript

---

**Execution note:** Use `@superpowers/test-driven-development` for each task and finish with `@superpowers/verification-before-completion`.

### Task 1: Add assistant activation to persistence

**Files:**
- Modify: `src/main/persistence/migrate.ts`
- Modify: `src/main/persistence/migrate.test.ts`
- Modify: `src/main/persistence/repos/assistants-repo.ts`
- Create: `src/main/persistence/repos/assistants-repo.test.ts`

**Step 1: Write the failing tests**

Add:

- a migration test that expects `app_assistants` to contain an `enabled` column,
- a migration/backfill test that proves assistants referenced by channels become enabled,
- a repo test that proves `create`, `getById`, `list`, and `update` preserve `enabled`.

Use this target shape in the repo test:

```ts
expect(created).toMatchObject({
  name: 'Ops Assistant',
  enabled: false
})
```

```ts
expect(updated).toMatchObject({
  id: created.id,
  enabled: true
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/main/persistence/migrate.test.ts src/main/persistence/repos/assistants-repo.test.ts
```

Expected:

- FAIL because `enabled` does not exist yet,
- FAIL because the assistants repo does not persist `enabled`.

**Step 3: Write the minimal implementation**

Implement:

- `enabled INTEGER NOT NULL DEFAULT 0` on `app_assistants`,
- migration-safe `ALTER TABLE` logic for older databases,
- a backfill query that sets `enabled = 1` for assistants referenced by `app_channels`,
- `AppAssistant.enabled`,
- `CreateAssistantInput.enabled?: boolean`,
- `UpdateAssistantInput.enabled?: boolean`,
- `SELECT` / `INSERT` / `UPDATE` support in `AssistantsRepository`.

Keep the backfill focused:

```sql
UPDATE app_assistants
SET enabled = 1
WHERE id IN (
  SELECT DISTINCT assistant_id
  FROM app_channels
  WHERE assistant_id IS NOT NULL
)
```

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/main/persistence/migrate.test.ts src/main/persistence/repos/assistants-repo.test.ts
```

Expected:

- PASS with the new column present,
- PASS with repo reads/writes preserving `enabled`.

**Step 5: Commit**

```bash
git add src/main/persistence/migrate.ts src/main/persistence/migrate.test.ts src/main/persistence/repos/assistants-repo.ts src/main/persistence/repos/assistants-repo.test.ts
git commit -m "feat: add assistant activation persistence"
```

### Task 2: Surface assistant activation through shared APIs

**Files:**
- Modify: `src/main/server/validators/assistants-validator.ts`
- Modify: `src/main/server/routes/assistants-route.ts`
- Modify: `src/main/server/routes/assistants-route.test.ts`
- Modify: `src/renderer/src/features/assistants/assistants-query.ts`

**Step 1: Write the failing tests**

Extend route tests to cover:

- `POST /v1/assistants` accepts `enabled`,
- `PATCH /v1/assistants/:assistantId` updates `enabled`,
- responses include the new boolean.

Use this request payload in the test:

```json
{
  "name": "Ops Assistant",
  "providerId": "provider-1",
  "enabled": true
}
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/main/server/routes/assistants-route.test.ts
```

Expected:

- FAIL because validators reject or ignore `enabled`,
- FAIL because the route response omits the field.

**Step 3: Write the minimal implementation**

Add `enabled: z.boolean().optional()` to assistant schemas and thread the field through route handling and shared renderer types:

```ts
export type AssistantRecord = {
  id: string
  name: string
  enabled: boolean
  // existing fields...
}
```

Do not add any new UI here—just keep shared data contracts accurate.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/main/server/routes/assistants-route.test.ts src/renderer/src/features/assistants/assistants-query.test.ts
```

Expected:

- PASS for assistant route coverage,
- PASS with no regression in the shared query module.

**Step 5: Commit**

```bash
git add src/main/server/validators/assistants-validator.ts src/main/server/routes/assistants-route.ts src/main/server/routes/assistants-route.test.ts src/renderer/src/features/assistants/assistants-query.ts
git commit -m "feat: expose assistant activation flag"
```

### Task 3: Make channel runtime assistant-driven

**Files:**
- Modify: `src/main/persistence/repos/channels-repo.ts`
- Modify: `src/main/persistence/repos/channels-repo.test.ts`
- Modify: `src/main/channels/channel-service.ts`
- Modify: `src/main/channels/channel-service.test.ts`
- Modify: `src/main/channels/channel-message-router.ts`
- Modify: `src/main/channels/channel-message-router.test.ts`

**Step 1: Write the failing tests**

Add tests for:

- storing multiple `lark` channel rows with different credentials,
- listing attachable/unbound channels,
- loading runnable channels only when their attached assistant is enabled,
- ignoring inbound channel messages when the attached assistant is disabled.

Use test data like:

```ts
await repo.create({
  type: 'lark',
  name: 'Support Lark',
  assistantId: assistantA.id,
  config: { appId: 'cli_a', appSecret: 'secret-a' }
})

await repo.create({
  type: 'lark',
  name: 'Ops Lark',
  assistantId: null,
  config: { appId: 'cli_b', appSecret: 'secret-b' }
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/main/persistence/repos/channels-repo.test.ts src/main/channels/channel-service.test.ts src/main/channels/channel-message-router.test.ts
```

Expected:

- FAIL because runtime still reads channel-level enabled state,
- FAIL because the repo lacks helper methods for multi-channel attachment flows.

**Step 3: Write the minimal implementation**

Add repo helpers such as:

- `getByAssistantId(assistantId: string)`,
- `listUnbound()`,
- `listRuntimeEnabled()` or equivalent join-backed query.

Refactor the channel service to load only runnable channel bindings:

```ts
type ChannelsRepositoryLike = {
  listRuntimeEnabled(): Promise<AppChannel[]>
}
```

Add a defensive guard in `ChannelMessageRouter` so disabled assistants cannot process messages even if an old adapter event slips through.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/main/persistence/repos/channels-repo.test.ts src/main/channels/channel-service.test.ts src/main/channels/channel-message-router.test.ts
```

Expected:

- PASS with multiple Lark channels supported,
- PASS with only enabled-assistant channels started,
- PASS with disabled-assistant messages ignored.

**Step 5: Commit**

```bash
git add src/main/persistence/repos/channels-repo.ts src/main/persistence/repos/channels-repo.test.ts src/main/channels/channel-service.ts src/main/channels/channel-service.test.ts src/main/channels/channel-message-router.ts src/main/channels/channel-message-router.test.ts
git commit -m "feat: gate channel runtime by assistant activation"
```

### Task 4: Add the claws orchestration API

**Files:**
- Create: `src/main/server/validators/claws-validator.ts`
- Create: `src/main/server/routes/claws-route.ts`
- Create: `src/main/server/routes/claws-route.test.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/default-agent/default-agent-bootstrap.ts`

**Step 1: Write the failing tests**

Add route tests for:

- listing non-built-in assistants as claws,
- listing available unbound channels,
- creating a claw with a new inline Lark channel,
- updating a claw to swap channels,
- rejecting a channel already attached to another assistant,
- deleting a claw while leaving the channel reusable,
- reloading channel service after every mutation.

Use this request shape:

```json
{
  "assistant": {
    "name": "Ops Assistant",
    "providerId": "provider-1",
    "instructions": "Handle ops questions.",
    "enabled": true
  },
  "channel": {
    "mode": "create",
    "type": "lark",
    "name": "Ops Lark",
    "appId": "cli_ops",
    "appSecret": "secret-ops"
  }
}
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/main/server/routes/claws-route.test.ts
```

Expected:

- FAIL because the route and validator do not exist.

**Step 3: Write the minimal implementation**

Implement:

- a `GET /v1/claws` response that filters out the built-in default assistant,
- a `POST /v1/claws` flow that creates assistant + optional new channel,
- a `PATCH /v1/claws/:assistantId` flow that updates assistant fields and rebinds channels safely,
- a `DELETE /v1/claws/:assistantId` flow that removes the assistant and leaves channel reuse to the FK,
- route registration in `create-app.ts`.

Keep the built-in filter server-side by checking:

```ts
assistant.mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] === true
```

Do not create a new `claw` table.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/main/server/routes/claws-route.test.ts src/main/server/health-route.test.ts
```

Expected:

- PASS for the new claws API,
- PASS with no `create-app` regression.

**Step 5: Commit**

```bash
git add src/main/server/validators/claws-validator.ts src/main/server/routes/claws-route.ts src/main/server/routes/claws-route.test.ts src/main/server/create-app.ts src/main/default-agent/default-agent-bootstrap.ts
git commit -m "feat: add claws orchestration api"
```

### Task 5: Build the renderer query layer and claws page

**Files:**
- Create: `src/renderer/src/features/claws/claws-query.ts`
- Create: `src/renderer/src/features/claws/claws-query.test.ts`
- Create: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Create: `src/renderer/src/features/claws/pages/claws-page.test.tsx`
- Create: `src/renderer/src/features/claws/components/claw-editor-dialog.tsx`
- Create: `src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx`
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/app/layout/app-shell.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`

**Step 1: Write the failing tests**

Add renderer tests for:

- top-nav rendering of `Claws`,
- onboarding panel when no non-built-in assistant has a channel,
- list rendering for existing claws,
- editing a claw to create a new Lark channel inline,
- preventing selection of channels already bound elsewhere.

Mirror existing page-test style by stubbing query functions and asserting visible text / button behavior.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/renderer/src/app/router.test.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx
```

Expected:

- FAIL because the route, nav item, and components do not exist.

**Step 3: Write the minimal implementation**

Implement:

- a `useClaws` query module over `/v1/claws`,
- a `ClawsPage` that renders onboarding + list states,
- a small dialog/form for create/edit,
- top-nav wiring for `/claws`.

Use a compact response type like:

```ts
export type ClawRecord = {
  id: string
  name: string
  providerId: string | null
  instructions: string
  enabled: boolean
  channel: null | {
    id: string
    type: string
    name: string
    status: 'connected' | 'disconnected' | 'error'
    errorMessage: string | null
  }
}
```

Prefer existing UI primitives from `src/renderer/src/components/ui`.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/renderer/src/app/router.test.tsx src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx
```

Expected:

- PASS with the new route and page behavior in place.

**Step 5: Commit**

```bash
git add src/renderer/src/features/claws/claws-query.ts src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/pages/claws-page.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/features/claws/components/claw-editor-dialog.tsx src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx src/renderer/src/app/router.tsx src/renderer/src/app/layout/app-shell.tsx src/renderer/src/app/router.test.tsx
git commit -m "feat: add claws management page"
```

### Task 6: Remove the legacy channels settings surface

**Files:**
- Modify: `src/renderer/src/features/settings/components/settings-sidebar-nav.tsx`
- Modify: `src/renderer/src/features/settings/pages/settings-page-layout.test.tsx`
- Delete: `src/renderer/src/features/settings/pages/channels-settings-page.tsx`
- Delete: `src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
- Delete: `src/renderer/src/features/settings/channels/channels-query.ts`
- Delete: `src/main/server/routes/channels-settings-route.ts`
- Delete: `src/main/server/routes/channels-settings-route.test.ts`
- Delete: `src/main/server/validators/channels-validator.ts`
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`

**Step 1: Write the failing tests**

Update existing router/settings tests to assert:

- `Channels` no longer appears in the settings sidebar,
- `/settings/channels` redirects to `/claws`,
- `Claws` appears in the top nav instead.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/renderer/src/app/router.test.tsx src/renderer/src/features/settings/pages/settings-page-layout.test.tsx
```

Expected:

- FAIL because the old page and nav entry still exist.

**Step 3: Write the minimal implementation**

Remove the settings-page channel surface and leave only a route redirect:

```ts
{
  path: 'channels',
  loader: () => redirect('/claws')
}
```

Delete the now-unused legacy backend/frontend channel-settings modules.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/renderer/src/app/router.test.tsx src/renderer/src/features/settings/pages/settings-page-layout.test.tsx
```

Expected:

- PASS with no `Channels` settings page left in the UI.

**Step 5: Commit**

```bash
git add src/renderer/src/features/settings/components/settings-sidebar-nav.tsx src/renderer/src/features/settings/pages/settings-page-layout.test.tsx src/renderer/src/app/router.tsx src/renderer/src/app/router.test.tsx
git rm src/renderer/src/features/settings/pages/channels-settings-page.tsx src/renderer/src/features/settings/pages/channels-settings-page.test.tsx src/renderer/src/features/settings/channels/channels-query.ts src/main/server/routes/channels-settings-route.ts src/main/server/routes/channels-settings-route.test.ts src/main/server/validators/channels-validator.ts
git commit -m "refactor: remove legacy channels settings page"
```

### Task 7: Verify the full claws slice end-to-end

**Files:**
- Modify: none unless fixes are needed

**Step 1: Run the focused backend and renderer suites**

Run:

```bash
npm test -- src/main/persistence/migrate.test.ts src/main/persistence/repos/assistants-repo.test.ts src/main/persistence/repos/channels-repo.test.ts src/main/channels/channel-service.test.ts src/main/channels/channel-message-router.test.ts src/main/server/routes/assistants-route.test.ts src/main/server/routes/claws-route.test.ts src/renderer/src/app/router.test.tsx src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx src/renderer/src/features/settings/pages/settings-page-layout.test.tsx
```

Expected:

- PASS with no unexpected regressions in the claws slice.

**Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected:

- PASS for both node and web configs.

**Step 3: Run the broader suite if time permits**

Run:

```bash
npm test
```

Expected:

- PASS or only pre-existing unrelated failures.

**Step 4: If any regression appears, fix the smallest root cause**

Keep fixes limited to claws-related breakages. Do not sweep unrelated files.

**Step 5: Commit**

```bash
git add -A
git commit -m "test: verify claws workflow end to end"
```
