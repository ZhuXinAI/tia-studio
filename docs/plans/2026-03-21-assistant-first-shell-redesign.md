# Assistant-First Shell Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the app entrance around an assistant-first chat detail view, move assistant switching into the global top nav, keep Team as a separate top-level mode, and demote Claws into an assistant/channel management surface instead of the primary home.

**Architecture:** Keep the existing route-driven `chat` and `team` pages, but make the shell own cross-mode navigation and contextual switching. Persist the last active app mode plus last selected team context in local storage, keep chat selection persistence, and let `/chat` and `/team` restore their own detail context while `/` restores the last mode. Reuse the existing assistant, team workspace, and claws data sources rather than introducing new global stores.

**Tech Stack:** Electron renderer, React 19, TypeScript, React Router, TanStack Query, Tailwind CSS, Vitest, i18next.

---

## Execution rules

- Apply TDD where practical: write or adjust focused tests before implementation.
- Keep the first pass incremental: preserve `/claws` as a route even after removing it from primary navigation.
- Do not mix team selection into assistant selection; treat them as separate shell contexts.
- Prefer focused test runs before broader typecheck commands.

### Task 1: Add shell-level app mode persistence and root entrance restoration

**Files:**
- Create: `src/renderer/src/app/navigation/app-mode-state.ts`
- Create: `src/renderer/src/app/navigation/app-mode-state.test.ts`
- Create: `src/renderer/src/app/routes/app-entry-route.tsx`
- Modify: `src/renderer/src/app/router.tsx`
- Test: `src/renderer/src/app/router.test.tsx`

**Step 1: Write the failing storage helper tests**

- Cover `readStoredAppMode()` returning `null` for missing or invalid values.
- Cover `storeAppMode('chat')` and `storeAppMode('team')`.
- Cover the default fallback staying on `chat` when storage is unavailable.

**Step 2: Run the focused helper test**

Run: `npm test -- src/renderer/src/app/navigation/app-mode-state.test.ts`
Expected: FAIL because the new helper file does not exist yet.

**Step 3: Implement the minimal storage helper**

- Add `type AppMode = 'chat' | 'team'`.
- Add `readStoredAppMode(): AppMode | null`.
- Add `storeAppMode(mode: AppMode): void`.
- Use a dedicated key such as `tia.app.last-mode`.

**Step 4: Re-run the helper test**

Run: `npm test -- src/renderer/src/app/navigation/app-mode-state.test.ts`
Expected: PASS

**Step 5: Write the failing router tests**

- Replace the current root expectation from `/claws` to the new shell entry behavior.
- Add one test where stored mode is `chat` and `/` resolves to `/chat`.
- Add one test where stored mode is `team` and `/` resolves to `/team`.

**Step 6: Run the focused router test**

Run: `npm test -- src/renderer/src/app/router.test.tsx`
Expected: FAIL because the router still redirects `/` to `/claws`.

**Step 7: Implement the new root route**

- Replace the index loader redirect in `src/renderer/src/app/router.tsx` with an `AppEntryRoute` element.
- In `src/renderer/src/app/routes/app-entry-route.tsx`, read the stored app mode and render `<Navigate replace to="/team" />` for team mode, otherwise `<Navigate replace to="/chat" />`.
- Keep the settings index redirect logic unchanged.

**Step 8: Re-run the router test**

Run: `npm test -- src/renderer/src/app/router.test.tsx`
Expected: PASS for the updated root-route behavior.

**Step 9: Commit**

```bash
git add src/renderer/src/app/navigation/app-mode-state.ts src/renderer/src/app/navigation/app-mode-state.test.ts src/renderer/src/app/routes/app-entry-route.tsx src/renderer/src/app/router.tsx src/renderer/src/app/router.test.tsx
git commit -m "feat: restore last app mode from shell entry"
```

### Task 2: Add team selection persistence so `/team` can restore the last workspace and thread

**Files:**
- Create: `src/renderer/src/features/team/team-page-routing.ts`
- Create: `src/renderer/src/features/team/team-page-routing.test.ts`
- Modify: `src/renderer/src/features/team/hooks/use-team-page-controller.ts`
- Test: `src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx`

**Step 1: Write the failing team routing helper tests**

- Cover `routeToTeam(workspaceId, threadId)`.
- Cover `readStoredTeamSelection()` returning `null` for invalid JSON or empty ids.
- Cover `storeTeamSelection({ workspaceId, threadId })`.
- Cover `sortTeamThreadsByRecentActivity()` on `lastMessageAt` and `createdAt`.

**Step 2: Run the focused helper test**

Run: `npm test -- src/renderer/src/features/team/team-page-routing.test.ts`
Expected: FAIL because the new helper file does not exist yet.

**Step 3: Implement the routing helper**

- Move `routeToTeam()` and `sortTeamThreadsByRecentActivity()` out of the hook into `team-page-routing.ts`.
- Add:
  - `readStoredTeamSelection(): { workspaceId: string; threadId: string | null } | null`
  - `storeTeamSelection(selection): void`
- Use a dedicated key such as `tia.team.last-selection`.

**Step 4: Re-run the helper test**

Run: `npm test -- src/renderer/src/features/team/team-page-routing.test.ts`
Expected: PASS

**Step 5: Write the failing controller tests**

- Add one test that mounts `/team` with a stored selection and verifies navigation restores the stored workspace and thread when both still exist.
- Add one test that falls back to the stored workspace route when the stored thread no longer exists.
- Add one test that falls back to the first workspace when there is no stored selection.
- Add one test that keeps `/team` on the empty onboarding state when no workspaces exist.

**Step 6: Run the focused controller test**

Run: `npm test -- src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx`
Expected: FAIL until restore/store behavior is implemented.

**Step 7: Implement persistence in the team controller**

- Import the new helper functions into `use-team-page-controller.ts`.
- On `/team` with loaded workspaces and no selected workspace, restore the stored selection first, then fall back to the first workspace.
- When `selectedWorkspace` or `selectedThread` changes, call `storeTeamSelection(...)`.
- Keep the current invalid-thread fallback behavior: if a thread id no longer exists in the selected workspace, route back to the workspace detail.

**Step 8: Re-run the controller test**

Run: `npm test -- src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx`
Expected: PASS

**Step 9: Commit**

```bash
git add src/renderer/src/features/team/team-page-routing.ts src/renderer/src/features/team/team-page-routing.test.ts src/renderer/src/features/team/hooks/use-team-page-controller.ts src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx
git commit -m "feat: restore last team workspace and thread"
```

### Task 3: Make chat strictly assistant-detail again and simplify `/chat` restoration

**Files:**
- Modify: `src/renderer/src/features/threads/hooks/use-thread-page-controller.ts`
- Modify: `src/renderer/src/features/threads/thread-page-routing.ts`
- Test: `src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`
- Test: `src/renderer/src/app/router.test.tsx`

**Step 1: Write the failing controller tests**

- Add one test that mounts `/chat` with a stored chat selection and verifies it restores the assistant and thread.
- Add one test that mounts `/chat` without stored selection and routes to the latest thread across assistants.
- Add one test that mounts `/chat` without any threads and routes to the first assistant detail.
- Add one test that mounts `/chat` with no assistants and routes to `/claws`.

**Step 2: Run the focused controller test**

Run: `npm test -- src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`
Expected: FAIL because `/chat` currently allows a master directory state.

**Step 3: Implement the assistant-detail restore logic**

- In `use-thread-page-controller.ts`, treat missing `params.assistantId` as a restore case instead of a stable master state.
- Reuse the existing stored chat selection helpers from `thread-page-routing.ts`.
- Restore in this order:
  1. stored assistant + stored thread if still valid
  2. latest thread across assistants
  3. first assistant detail
  4. `/claws` if there are no assistants
- Keep invalid explicit assistant ids using the same fallback resolution.

**Step 4: Re-run the controller test**

Run: `npm test -- src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`
Expected: PASS

**Step 5: Update the router render expectations**

- Change the `/chat` render assertion in `src/renderer/src/app/router.test.tsx` to expect thread-list UI rather than the assistant master list.
- Keep a smoke test that `/chat/:assistantId` still matches correctly in `src/renderer/src/app/router.chat-route.test.tsx`.

**Step 6: Run the router tests**

Run: `npm test -- src/renderer/src/app/router.test.tsx src/renderer/src/app/router.chat-route.test.tsx`
Expected: PASS

**Step 7: Commit**

```bash
git add src/renderer/src/features/threads/hooks/use-thread-page-controller.ts src/renderer/src/features/threads/thread-page-routing.ts src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx src/renderer/src/app/router.test.tsx src/renderer/src/app/router.chat-route.test.tsx
git commit -m "feat: restore assistant detail from chat root"
```

### Task 4: Move assistant and workspace switching into the global shell

**Files:**
- Create: `src/renderer/src/app/layout/chat-context-switcher.tsx`
- Create: `src/renderer/src/app/layout/chat-context-switcher.test.tsx`
- Create: `src/renderer/src/app/layout/team-context-switcher.tsx`
- Create: `src/renderer/src/app/layout/team-context-switcher.test.tsx`
- Modify: `src/renderer/src/app/layout/app-shell.tsx`
- Test: `src/renderer/src/app/layout/app-shell.test.tsx`
- Test: `src/renderer/src/app/layout/app-shell.update.test.tsx`

**Step 1: Write the failing assistant switcher tests**

- Cover rendering the current assistant label on chat routes.
- Cover opening the dropdown and selecting another assistant.
- Cover rendering a management action such as `Manage assistants & channels`.
- If channel status is shown, cover one row with a connected channel badge and one without a channel.

**Step 2: Run the focused assistant switcher test**

Run: `npm test -- src/renderer/src/app/layout/chat-context-switcher.test.tsx`
Expected: FAIL because the new component does not exist yet.

**Step 3: Implement the assistant switcher**

- Use `useAssistants()` as the primary list source.
- Use route params or `useLocation()` to derive the current assistant.
- On selection, navigate to `/chat/:assistantId`.
- Add a footer action that navigates to `/claws`.
- If channel metadata is needed, join optional summary data from `src/renderer/src/features/claws/claws-query.ts` without making claws the source of truth for assistant identity.

**Step 4: Re-run the assistant switcher test**

Run: `npm test -- src/renderer/src/app/layout/chat-context-switcher.test.tsx`
Expected: PASS

**Step 5: Write the failing workspace switcher tests**

- Cover rendering the current workspace name on team routes.
- Cover selecting a different workspace and navigating to `/team/:workspaceId`.
- Cover empty-state behavior when there are no workspaces.

**Step 6: Run the focused workspace switcher test**

Run: `npm test -- src/renderer/src/app/layout/team-context-switcher.test.tsx`
Expected: FAIL because the new component does not exist yet.

**Step 7: Implement the workspace switcher**

- Use `useTeamWorkspaces()` as the source of workspace options.
- Derive the current workspace from route params.
- On selection, navigate to `/team/:workspaceId`.
- Keep thread selection scoped to the team controller; selecting a workspace from the shell only changes workspace context.

**Step 8: Re-run the workspace switcher test**

Run: `npm test -- src/renderer/src/app/layout/team-context-switcher.test.tsx`
Expected: PASS

**Step 9: Write the failing shell tests**

- Update the shell test suite to expect:
  - top-level `Chats`
  - top-level `Team`
  - no top-level `Claws` button
  - contextual assistant switcher on chat routes
  - contextual workspace switcher on team routes
  - settings gear still present on the right

**Step 10: Run the focused shell tests**

Run: `npm test -- src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/app/layout/app-shell.update.test.tsx`
Expected: FAIL because `AppShell` still renders the old nav.

**Step 11: Implement the new top nav**

- In `src/renderer/src/app/layout/app-shell.tsx`, keep `Chats` and `Team` as the only stable mode buttons.
- Import `storeAppMode()` and call it when navigating between modes.
- Render:
  - `ChatContextSwitcher` for `/chat` routes
  - `TeamContextSwitcher` for `/team` routes
  - a neutral label such as `Assistants & Channels` for `/claws`
- Keep the update button and settings gear aligned on the right.

**Step 12: Re-run the shell tests**

Run: `npm test -- src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/app/layout/app-shell.update.test.tsx`
Expected: PASS

**Step 13: Commit**

```bash
git add src/renderer/src/app/layout/chat-context-switcher.tsx src/renderer/src/app/layout/chat-context-switcher.test.tsx src/renderer/src/app/layout/team-context-switcher.tsx src/renderer/src/app/layout/team-context-switcher.test.tsx src/renderer/src/app/layout/app-shell.tsx src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/app/layout/app-shell.update.test.tsx
git commit -m "feat: add shell-level assistant and workspace switchers"
```

### Task 5: Simplify the chat sidebar so it only handles threads for the active assistant

**Files:**
- Modify: `src/renderer/src/features/threads/components/thread-sidebar.tsx`
- Test: `src/renderer/src/features/threads/components/thread-sidebar.test.tsx`
- Modify: `src/renderer/src/features/threads/pages/thread-page.tsx`
- Test: `src/renderer/src/features/threads/thread-page.test.tsx`

**Step 1: Write the failing sidebar tests**

- Remove expectations for the assistant master list, back button, and assistant dropdown in the sidebar.
- Add expectations that the sidebar always renders:
  - current assistant thread list
  - new thread button
  - thread search
  - delete confirmation flow

**Step 2: Run the focused sidebar test**

Run: `npm test -- src/renderer/src/features/threads/components/thread-sidebar.test.tsx`
Expected: FAIL because the sidebar still supports the old master-detail assistant view.

**Step 3: Implement the sidebar simplification**

- Remove `AssistantSwitcher`.
- Remove the assistant master list branch.
- Keep virtualization, search, thread delete confirmation, and new-thread creation.
- Assume `ThreadPage` only renders the sidebar when there is a selected assistant; otherwise show a loading or redirect transient state while `/chat` resolves.

**Step 4: Re-run the sidebar test**

Run: `npm test -- src/renderer/src/features/threads/components/thread-sidebar.test.tsx`
Expected: PASS

**Step 5: Update page wiring tests**

- Adjust `src/renderer/src/features/threads/thread-page.test.tsx` so it no longer expects assistant directory copy on `/chat`.
- Keep coverage for the assistant config dialog and chat card wiring.

**Step 6: Run the page test**

Run: `npm test -- src/renderer/src/features/threads/thread-page.test.tsx`
Expected: PASS

**Step 7: Commit**

```bash
git add src/renderer/src/features/threads/components/thread-sidebar.tsx src/renderer/src/features/threads/components/thread-sidebar.test.tsx src/renderer/src/features/threads/pages/thread-page.tsx src/renderer/src/features/threads/thread-page.test.tsx
git commit -m "feat: reduce chat sidebar to thread navigation"
```

### Task 6: Reposition Claws as assistant and channel management instead of a primary nav destination

**Files:**
- Modify: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Test: `src/renderer/src/features/claws/pages/claws-page.test.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Run: `npm run i18n:sync`

**Step 1: Write the failing claws page tests**

- Replace the old expectation that `/claws` is the main top-nav destination.
- Add expectations for management-oriented copy such as `Assistants & Channels`, `Switch active assistant`, or `Manage assistant channel bindings`.
- Keep existing create/edit/delete coverage intact.

**Step 2: Run the focused claws page test**

Run: `npm test -- src/renderer/src/features/claws/pages/claws-page.test.tsx`
Expected: FAIL because the page still reads like a primary “home” destination.

**Step 3: Update the management copy and shell affordances**

- Keep the existing CRUD and pairing flows in `claws-page.tsx`.
- Change the page header copy so it reads as a management surface rather than the app entrance.
- Make sure the chat context switcher points here via `Manage assistants & channels`.
- Keep `/claws` routable for compatibility even though it is no longer in the primary nav.

**Step 4: Re-run the claws page test**

Run: `npm test -- src/renderer/src/features/claws/pages/claws-page.test.tsx`
Expected: PASS

**Step 5: Sync translations**

Run: `npm run i18n:sync`
Expected: PASS and locale files update to include new app-shell and claws copy.

**Step 6: Commit**

```bash
git add src/renderer/src/features/claws/pages/claws-page.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/i18n/locales/en-US.json src/renderer/src/i18n/locales/*.json src/renderer/src/app/router.test.tsx
git commit -m "feat: demote claws to assistant management surface"
```

### Task 7: Verify the full shell flow and guard against regressions

**Files:**
- Run-only verification across modified app-shell, router, chat, team, and claws files

**Step 1: Run focused renderer tests**

Run: `npm test -- src/renderer/src/app/router.test.tsx src/renderer/src/app/layout/app-shell.test.tsx src/renderer/src/app/layout/app-shell.update.test.tsx src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx src/renderer/src/features/threads/components/thread-sidebar.test.tsx src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx`
Expected: PASS

**Step 2: Run broader route and page coverage**

Run: `npm test -- src/renderer/src/app/router.chat-route.test.tsx src/renderer/src/features/threads/thread-page.test.tsx src/renderer/src/features/team/team-page.test.tsx`
Expected: PASS

**Step 3: Run renderer typecheck**

Run: `npm run typecheck:web`
Expected: PASS

**Step 4: Review behavior manually in the desktop app**

- Open the app on `/`.
- Verify it restores `Chats` or `Team` based on the last mode.
- Verify `/chat` restores the last assistant/thread and the assistant switcher lives in the top nav.
- Verify `/team` restores the last workspace/thread and the workspace switcher lives in the top nav.
- Verify `/claws` is still reachable from the assistant switcher management action.
- Verify the settings gear remains stable across modes.

**Step 5: Commit**

```bash
git add -A
git commit -m "test: verify assistant-first shell navigation"
```
