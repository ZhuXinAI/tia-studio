# ACP-First Team Rebrand Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebrand TIA Studio around teams, ACP reuse, and channel bindings while keeping the current harness available as an advanced TIA-native capability instead of the default product story.

**Architecture:** Keep `assistant` as the internal identity model because the current runtime, threads, channels, cron jobs, heartbeats, and team membership all key off `assistantId`. Do **not** introduce a new core `Binding` persistence/runtime object in the first pass. Instead, add assistant origin/capability metadata so TIA can distinguish `external-acp` agents from `tia` agents, expose `ChannelBinding` as the user-facing replacement for `claw`, and gate advanced features such as heartbeat, schedule, guardrails, MCP-heavy tooling, and deep workspace features to TIA-native agents unless the user explicitly upgrades an ACP agent into a TIA-managed agent.

**Tech Stack:** Electron 39, React 19, React Router 7, Hono, Mastra, ACP providers, TypeScript 5, Vitest 4, LibSQL

---

## Decision

- **Recommended path:** keep the assistant-first core and add `origin + capability gating`.
- **Do not** make `Binding` the new core runtime abstraction yet.
- If a new name is needed, use:
  - internal persisted identity: `assistant` (keep existing code/data model)
  - user-facing external/TIA-capable identity: `agent`
  - user-facing channel pair: `ChannelBinding`

### Why this is easier

- `app_assistants` is already the central persisted identity in `src/main/persistence/repos/assistants-repo.ts`.
- direct chat routes, team membership, cron, heartbeat, and channels all already point to `assistantId`.
- `src/main/server/routes/claws-route.ts` already models the “channel + assistant” composition without a separate database object.
- `src/main/mastra/team-runtime.ts` already pulls team members from assistant ids, so ACP-backed assistants can join teams today once they exist as assistant records.

Introducing a new core `Binding` object would force a broad migration across persistence, routing, chat history ownership, team membership, cron ownership, heartbeat ownership, and renderer assumptions. Adding assistant origin/capability flags avoids that rewrite and still gets the product behavior you want.

---

## Execution Rules

- Apply **TDD** per task (`red -> green -> refactor`).
- Preserve current assistant ids, thread ownership, channel binding behavior, and team membership behavior.
- Keep old routes and payloads working during the first pass; add rebrand aliases and UI copy before removing legacy terms.
- Default new ACP-reuse flows to the minimal experience; require an explicit upgrade path for TIA-native advanced features.
- Keep commits small and focused.

---

### Task 1: Add assistant origin and advanced-feature capability metadata

**Files:**

- Modify: `src/main/persistence/migrate.ts`
- Modify: `src/main/persistence/migrate.test.ts`
- Modify: `src/main/persistence/migrate-fallback.test.ts`
- Modify: `src/main/persistence/repos/assistants-repo.ts`
- Modify: `src/main/persistence/repos/assistants-repo.test.ts`
- Modify: `src/main/server/validators/assistants-validator.ts`
- Modify: `src/renderer/src/features/assistants/assistants-query.ts`

**Step 1: Write the failing tests**

Add coverage for:

- default assistant origin when old rows do not have new columns
- round-tripping assistant origin and `studioFeaturesEnabled`
- validating allowed origins such as:
  - `tia`
  - `external-acp`
  - `built-in`

Test sketch:

```ts
expect(created.origin).toBe('external-acp')
expect(created.studioFeaturesEnabled).toBe(false)
```

**Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test -- src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/persistence/repos/assistants-repo.test.ts
```

Expected: FAIL because assistants do not yet distinguish ACP-backed reuse from TIA-native agents.

**Step 3: Write minimal implementation**

- Extend `app_assistants` with:
  - `origin TEXT NOT NULL DEFAULT 'tia'`
  - `studio_features_enabled INTEGER NOT NULL DEFAULT 1`
- Since this repo uses in-place schema guards, add `ensureAssistantOriginColumn(...)` and `ensureAssistantStudioFeaturesColumn(...)` in `src/main/persistence/migrate.ts`.
- Update `AppAssistant`, create/update input types, validators, and renderer query types.
- Normalize legacy rows as:
  - built-in assistant => `built-in`
  - all existing user assistants => `tia`

Implementation sketch:

```ts
type AssistantOrigin = 'tia' | 'external-acp' | 'built-in'

type AppAssistant = {
  // existing fields...
  origin: AssistantOrigin
  studioFeaturesEnabled: boolean
}
```

**Step 4: Re-run focused tests**

Run:

```bash
npm run test -- src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/persistence/repos/assistants-repo.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/persistence/migrate.ts src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/persistence/repos/assistants-repo.ts src/main/persistence/repos/assistants-repo.test.ts src/main/server/validators/assistants-validator.ts src/renderer/src/features/assistants/assistants-query.ts
git commit -m "feat: add assistant origin and studio capability flags"
```

---

### Task 2: Rebrand the shell so Team and ACP are primary, Agents is secondary

**Files:**

- Modify: `src/renderer/src/app/layout/app-shell.tsx`
- Modify: `src/renderer/src/app/layout/app-shell.test.tsx`
- Modify: `src/renderer/src/app/layout/app-shell.update.test.tsx`
- Modify: `src/renderer/src/app/routes/app-entry-loader.ts`
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/features/settings/components/settings-sidebar-nav.tsx`
- Modify: `src/renderer/src/features/settings/pages/settings-page-layout.test.tsx`
- Modify: `src/renderer/src/i18n/locales/en.json`
- Modify: `src/renderer/src/i18n/locales/zh.json`

**Step 1: Write the failing tests**

Add coverage for:

- shell nav labeling the secondary area as `Agents` instead of `Chats`
- first load defaulting to `/team` when there is no stored mode
- settings nav elevating ACP/runtime/provider surfaces above studio-only advanced settings

Test sketch:

```ts
expect(screen.getByText('Agents')).toBeInTheDocument()
expect(screen.getByText('Team')).toBeInTheDocument()
```

**Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/app/layout/app-shell.update.test.tsx src/renderer/src/features/settings/pages/settings-page-layout.test.tsx
```

Expected: FAIL because the shell still foregrounds `Chat` and the settings nav is still flat.

**Step 3: Write minimal implementation**

- Rebrand the top-level shell:
  - `Team` remains primary
  - `Chat` becomes `Agents`
- Keep the existing `/chat` route for compatibility, but allow a friendlier alias such as `/agents` if it helps copy and navigation.
- Update `app-entry-loader.ts` so first-run defaults to team while preserving stored mode restoration.
- Reorganize settings navigation into a product story that highlights ACP/runtime reuse first:
  - Providers
  - ACP / Runtimes
  - Channels
  - Advanced Studio
    - Security
    - Schedule / Cron
    - MCP
    - Web Search
    - Display / About

**Step 4: Re-run focused tests**

Run:

```bash
npm run test -- src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/app/layout/app-shell.update.test.tsx src/renderer/src/features/settings/pages/settings-page-layout.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/app/layout/app-shell.tsx src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/app/layout/app-shell.update.test.tsx src/renderer/src/app/routes/app-entry-loader.ts src/renderer/src/app/router.tsx src/renderer/src/features/settings/components/settings-sidebar-nav.tsx src/renderer/src/features/settings/pages/settings-page-layout.test.tsx src/renderer/src/i18n/locales/en.json src/renderer/src/i18n/locales/zh.json
git commit -m "refactor: rebrand shell around team and agents"
```

---

### Task 3: Add an ACP-first agent creation flow and demote TIA-native setup to an explicit upgrade path

**Files:**

- Modify: `src/renderer/src/features/claws/components/assistant-management-dialog.tsx`
- Modify: `src/renderer/src/features/assistants/assistant-editor.tsx`
- Modify: `src/renderer/src/features/assistants/assistant-editor.test.tsx`
- Modify: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Modify: `src/renderer/src/features/claws/pages/claws-page.test.tsx`
- Modify: `src/renderer/src/features/threads/pages/thread-page.tsx`
- Modify: `src/renderer/src/features/threads/thread-page.test.tsx`

**Step 1: Write the failing tests**

Add coverage for:

- offering two creation paths:
  - `Use Existing ACP Agent`
  - `Create TIA Agent`
- defaulting ACP reuse to `origin: 'external-acp'` and `studioFeaturesEnabled: false`
- hiding advanced tabs in the initial ACP flow

Test sketch:

```ts
expect(screen.getByText('Use Existing ACP Agent')).toBeInTheDocument()
expect(screen.getByText('Create TIA Agent')).toBeInTheDocument()
```

**Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/features/assistants/assistant-editor.test.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/features/threads/thread-page.test.tsx
```

Expected: FAIL because the create flow currently assumes one full assistant configuration experience.

**Step 3: Write minimal implementation**

- In `assistant-management-dialog.tsx`, add a top-level create choice:
  - ACP reuse path
  - TIA-native path
- In the ACP path:
  - capture name
  - choose Codex ACP / Claude Agent ACP provider
  - choose workspace root
  - optionally attach a channel
  - submit with `origin: 'external-acp'` and `studioFeaturesEnabled: false`
- In the TIA path:
  - preserve the full existing assistant editor experience
  - submit with `origin: 'tia'` and `studioFeaturesEnabled: true`
- In the editor, collapse advanced TIA-only tabs behind an explicit “Enable Studio Features” or “Upgrade to TIA Agent” affordance for ACP-origin agents.

**Step 4: Re-run focused tests**

Run:

```bash
npm run test -- src/renderer/src/features/assistants/assistant-editor.test.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/features/threads/thread-page.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/claws/components/assistant-management-dialog.tsx src/renderer/src/features/assistants/assistant-editor.tsx src/renderer/src/features/assistants/assistant-editor.test.tsx src/renderer/src/features/claws/pages/claws-page.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/features/threads/pages/thread-page.tsx src/renderer/src/features/threads/thread-page.test.tsx
git commit -m "feat: add acp-first agent onboarding"
```

---

### Task 4: Gate heartbeat, schedule, guardrails, and heavy tooling to TIA-native agents by default

**Files:**

- Modify: `src/main/mastra/assistant-runtime.ts`
- Modify: `src/main/mastra/assistant-runtime.test.ts`
- Modify: `src/main/heartbeat/assistant-heartbeats-service.ts`
- Modify: `src/main/heartbeat/assistant-heartbeats-service.test.ts`
- Modify: `src/main/cron/assistant-cron-jobs-service.ts`
- Modify: `src/main/cron/assistant-cron-jobs-service.test.ts`
- Modify: `src/main/server/routes/assistant-heartbeat-route.ts`
- Modify: `src/main/server/routes/assistant-heartbeat-route.test.ts`
- Modify: `src/main/server/routes/cron-jobs-route.ts`
- Modify: `src/main/server/routes/cron-jobs-route.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- ACP-origin assistants without studio features not being eligible for:
  - heartbeat
  - cron
  - global guardrail processors
  - heavyweight TIA-only tools where appropriate
- TIA-origin assistants keeping the current behavior
- ACP-origin assistants becoming eligible after `studioFeaturesEnabled` is turned on

Test sketch:

```ts
await expect(
  heartbeatsService.upsertHeartbeat({
    assistantId: 'assistant-acp',
    enabled: true,
    intervalMinutes: 30,
    prompt: 'check in'
  })
).rejects.toMatchObject({
  code: 'assistant_studio_features_required'
})
```

**Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test -- src/main/mastra/assistant-runtime.test.ts src/main/heartbeat/assistant-heartbeats-service.test.ts src/main/cron/assistant-cron-jobs-service.test.ts src/main/server/routes/assistant-heartbeat-route.test.ts src/main/server/routes/cron-jobs-route.test.ts
```

Expected: FAIL because advanced features currently apply based only on workspace presence and global settings.

**Step 3: Write minimal implementation**

- Add helper predicates such as:

```ts
function supportsStudioFeatures(assistant: AppAssistant): boolean {
  return assistant.origin === 'tia' || assistant.studioFeaturesEnabled === true
}
```

- In `assistant-runtime.ts`:
  - keep ACP chat/team/channel behavior available
  - gate TIA-native processors and tools based on `supportsStudioFeatures(...)`
- In heartbeat/cron services and routes:
  - require both workspace root and studio features
  - return a structured error if an ACP-origin agent has not been upgraded
- Keep teams and channel bindings compatible with ACP-origin assistants.

**Step 4: Re-run focused tests**

Run:

```bash
npm run test -- src/main/mastra/assistant-runtime.test.ts src/main/heartbeat/assistant-heartbeats-service.test.ts src/main/cron/assistant-cron-jobs-service.test.ts src/main/server/routes/assistant-heartbeat-route.test.ts src/main/server/routes/cron-jobs-route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime.ts src/main/mastra/assistant-runtime.test.ts src/main/heartbeat/assistant-heartbeats-service.ts src/main/heartbeat/assistant-heartbeats-service.test.ts src/main/cron/assistant-cron-jobs-service.ts src/main/cron/assistant-cron-jobs-service.test.ts src/main/server/routes/assistant-heartbeat-route.ts src/main/server/routes/assistant-heartbeat-route.test.ts src/main/server/routes/cron-jobs-route.ts src/main/server/routes/cron-jobs-route.test.ts
git commit -m "refactor: gate studio-only features by assistant origin"
```

---

### Task 5: Rebrand Claws to Channel Bindings without changing the core persistence model

**Files:**

- Modify: `src/main/server/routes/claws-route.ts`
- Modify: `src/main/server/routes/claws-route.test.ts`
- Modify: `src/renderer/src/features/claws/claws-query.ts`
- Modify: `src/renderer/src/features/claws/claws-query.test.ts`
- Modify: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Modify: `src/renderer/src/features/claws/pages/claws-page.test.tsx`
- Modify: `README.md`
- Modify: `CLAW.md`
- Modify: `STRUCTURE.md`
- Create: `docs/channel-bindings.md`

**Step 1: Write the failing tests**

Add coverage for:

- new user-facing copy using `Channel Binding` / `Bindings`
- keeping `/v1/claws` working while optionally exposing alias naming in the client
- listing ACP-origin agents in the bindings workflow without forcing TIA-only setup

Test sketch:

```ts
expect(container.textContent).toContain('Channel Bindings')
expect(container.textContent).not.toContain('Claws')
```

**Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test -- src/main/server/routes/claws-route.test.ts src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/pages/claws-page.test.tsx
```

Expected: FAIL because the renderer and docs still foreground `claw` as the primary term.

**Step 3: Write minimal implementation**

- Keep the backend persistence assistant-first.
- Keep `/v1/claws` during migration for compatibility, but rebrand the renderer surface and documentation to `Channel Bindings`.
- If a new internal name is needed for clarity, use `ChannelBinding` for the composed response type while leaving stored records unchanged.
- Update docs so the new story is:
  - `agent` is the reusable participant
  - `team` is the primary collaboration surface
  - `channel binding` is one channel paired to one agent
  - TIA-native assistant features are advanced capabilities layered on top

**Step 4: Re-run focused tests and broad verification**

Run:

```bash
npm run test -- src/main/server/routes/claws-route.test.ts src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/pages/claws-page.test.tsx
npm run typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/server/routes/claws-route.ts src/main/server/routes/claws-route.test.ts src/renderer/src/features/claws/claws-query.ts src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/pages/claws-page.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx README.md CLAW.md STRUCTURE.md docs/channel-bindings.md
git commit -m "refactor: rebrand claws as channel bindings"
```

---

### Task 6: Make teams clearly capable of mixing ACP-origin and TIA-native agents

**Files:**

- Modify: `src/main/mastra/team-runtime.ts`
- Modify: `src/main/mastra/team-runtime.test.ts`
- Modify: `src/renderer/src/features/team/components/team-config-dialog.tsx`
- Modify: `src/renderer/src/features/team/components/team-config-dialog.test.tsx`
- Modify: `src/renderer/src/features/team/pages/team-page.tsx`
- Modify: `src/renderer/src/features/team/team-page.test.tsx`

**Step 1: Write the failing tests**

Add coverage for:

- rendering assistant origin badges or labels in team member selection
- team config copy explaining that members can be ACP-origin or TIA-native
- team runtime continuing to delegate through selected members regardless of origin as long as the assistant is runnable

Test sketch:

```ts
expect(screen.getByText('ACP Agent')).toBeInTheDocument()
expect(screen.getByText('TIA Agent')).toBeInTheDocument()
```

**Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test -- src/main/mastra/team-runtime.test.ts src/renderer/src/features/team/components/team-config-dialog.test.tsx src/renderer/src/features/team/team-page.test.tsx
```

Expected: FAIL because team UI does not yet explain the mixed-member model.

**Step 3: Write minimal implementation**

- Preserve the existing `assistantId`-based team membership model.
- Surface assistant origin in team config so users can tell which members are:
  - ACP-backed reused agents
  - TIA-native upgraded agents
- Update team page copy to make team the headline product surface and show that mixed-member teams are expected.

**Step 4: Re-run focused tests**

Run:

```bash
npm run test -- src/main/mastra/team-runtime.test.ts src/renderer/src/features/team/components/team-config-dialog.test.tsx src/renderer/src/features/team/team-page.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/team-runtime.ts src/main/mastra/team-runtime.test.ts src/renderer/src/features/team/components/team-config-dialog.tsx src/renderer/src/features/team/components/team-config-dialog.test.tsx src/renderer/src/features/team/pages/team-page.tsx src/renderer/src/features/team/team-page.test.tsx
git commit -m "feat: surface mixed acp and tia members in teams"
```

---

## Rollout Notes

- The first release should keep existing routes and internal types alive while only changing copy, navigation, and capability gating.
- Existing assistants should migrate as `origin: 'tia'` so no user loses current functionality.
- New ACP-origin agents should be intentionally minimal by default:
  - direct chat
  - team membership
  - channel binding
  - ACP-backed execution
- The upgrade path to TIA-native capabilities should be one explicit user action, not an automatic side effect.
- Revisit a true `AgentRef` or `Binding` core abstraction only after the ACP-first product direction is proven and the current assistant-first compatibility layer becomes a real constraint.

