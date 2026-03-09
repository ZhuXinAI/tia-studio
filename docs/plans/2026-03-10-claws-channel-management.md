# Claws Channel Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve claws channel management by making selected channels visually distinct, adding channel edit support, restoring the settings-based channel manager, adding a safer claw deletion dialog with disable/delete/cancel actions, and localizing all new UI across existing locales.

**Architecture:** Reuse the existing claws/channel data model and add the missing configured-channel update API so both the claws picker and a restored settings page can share the same CRUD logic. Implement the renderer changes behind focused components/tests first, then wire router/settings navigation and the new delete-confirmation modal, keeping behavior aligned with existing claw enable/disable semantics.

**Tech Stack:** React, React Router, Vitest, Hono, TypeScript, existing i18n JSON locale files.

---

### Task 1: Add configured-channel update API

**Files:**

- Modify: `src/main/server/validators/claws-validator.ts`
- Modify: `src/main/server/routes/claws-route.ts`
- Modify: `src/renderer/src/features/claws/claws-query.ts`
- Test: `src/main/server/routes/claws-route.test.ts`

**Step 1: Write the failing test**

- Add a route test covering `PATCH /v1/claws/channels/:channelId` for an unbound channel and asserting updated name/config fields are returned.
- Add a route test covering conflict when attempting to edit a channel attached to an assistant other than the current one, if needed by the chosen API contract.

**Step 2: Run test to verify it fails**

- Run: `pnpm vitest run src/main/server/routes/claws-route.test.ts`
- Expected: FAIL because the patch route does not exist yet.

**Step 3: Write minimal implementation**

- Add an update schema for configured Telegram/Lark channels.
- Add the patch route in `claws-route.ts` using `channelsRepo.update(...)` and existing response-shaping helpers.
- Add a renderer query helper for updating configured channels.

**Step 4: Run test to verify it passes**

- Run: `pnpm vitest run src/main/server/routes/claws-route.test.ts`
- Expected: PASS for the new route test(s).

### Task 2: Add channel edit support and selected styling in the picker

**Files:**

- Modify: `src/renderer/src/features/claws/components/claw-channel-selector-dialog.tsx`
- Test: `src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx`

**Step 1: Write the failing test**

- Add a test asserting the selected channel button renders a distinct selected style hook and label/indicator.
- Add a test asserting the edit action opens a prefilled form and submits updated channel data.

**Step 2: Run test to verify it fails**

- Run: `pnpm vitest run src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx`
- Expected: FAIL because edit support and the new selected-state output do not exist.

**Step 3: Write minimal implementation**

- Refactor the nested add dialog into a reusable add/edit form state.
- Add an Edit action with prefilled values for the selected channel.
- Add clear selected styling/indicator hooks without changing selection rules.

**Step 4: Run test to verify it passes**

- Run: `pnpm vitest run src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx`
- Expected: PASS.

### Task 3: Restore settings channel manager

**Files:**

- Create: `src/renderer/src/features/settings/pages/channels-settings-page.tsx`
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`
- Modify: `src/renderer/src/features/settings/components/settings-sidebar-nav.tsx`
- Test: `src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
- Modify: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Test: `src/renderer/src/features/claws/pages/claws-page.test.tsx`

**Step 1: Write the failing test**

- Add a router test asserting `/settings/channels` renders the restored page instead of redirecting.
- Add a settings page test for listing configured channels and invoking add/edit/remove flows.

**Step 2: Run test to verify it fails**

- Run: `pnpm vitest run src/renderer/src/app/router.test.tsx src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
- Expected: FAIL because the route/page does not exist.

**Step 3: Write minimal implementation**

- Restore a settings page that uses the claws configured-channels data and CRUD helpers.
- Re-add Channels to the settings sidebar and router.
- Reuse the same management flow where practical to avoid duplicated logic.

**Step 4: Run test to verify it passes**

- Run: `pnpm vitest run src/renderer/src/app/router.test.tsx src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
- Expected: PASS.

### Task 4: Replace claw delete confirm with explicit modal actions

**Files:**

- Modify: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Test: `src/renderer/src/features/claws/pages/claws-page.test.tsx`

**Step 1: Write the failing test**

- Replace the `window.confirm`-based test with modal-driven tests for Cancel, Disable, and Confirm Delete.

**Step 2: Run test to verify it fails**

- Run: `pnpm vitest run src/renderer/src/features/claws/pages/claws-page.test.tsx`
- Expected: FAIL because the modal and actions do not exist.

**Step 3: Write minimal implementation**

- Add local state for a delete-confirmation dialog.
- Surface the warning that deleting a claw also removes the assistant’s thread history.
- Wire Disable to `updateClaw(...enabled: false)`, Confirm Delete to `deleteClaw(...)`, and Cancel to close the modal.

**Step 4: Run test to verify it passes**

- Run: `pnpm vitest run src/renderer/src/features/claws/pages/claws-page.test.tsx`
- Expected: PASS.

### Task 5: Add locale coverage for new copy

**Files:**

- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `src/renderer/src/i18n/locales/ru-RU.json`
- Modify: `src/renderer/src/i18n/locales/fr-FR.json`
- Modify: `src/renderer/src/i18n/locales/de-DE.json`
- Modify: `src/renderer/src/i18n/locales/ro-RO.json`
- Modify: `src/renderer/src/i18n/locales/pt-PT.json`
- Modify: `src/renderer/src/i18n/locales/zh-HK.json`
- Modify: `src/renderer/src/i18n/locales/zh-CN.json`
- Modify: `src/renderer/src/i18n/locales/ja-JP.json`
- Modify: `src/renderer/src/i18n/locales/es-ES.json`
- Modify: `src/renderer/src/i18n/locales/el-GR.json`

**Step 1: Write the failing test**

- If there is an existing i18n structure test that can be extended safely, add assertions for the new keys; otherwise rely on renderer tests that consume the new translations.

**Step 2: Run test to verify it fails**

- Run the narrowest affected renderer test(s) after adding references to the new keys.
- Expected: FAIL until locale files are updated.

**Step 3: Write minimal implementation**

- Add new keys for selected state, edit flow, settings nav/page, and delete dialog to every locale file.

**Step 4: Run test to verify it passes**

- Re-run the affected tests.

### Task 6: Final verification and delivery

**Files:**

- Modify: `docs/plans/2026-03-10-claws-channel-management.md`

**Step 1: Run focused test suite**

- Run: `pnpm vitest run src/main/server/routes/claws-route.test.ts src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx src/renderer/src/features/settings/pages/channels-settings-page.test.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/app/router.test.tsx`

**Step 2: Run broader verification if fast enough**

- Run: `pnpm vitest run`
- Expected: PASS, or capture unrelated pre-existing failures.

**Step 3: Push branch and open PR**

- Push the current worktree branch.
- Create a PR into `main` summarizing the claws UX, settings restoration, delete safety dialog, API support, and i18n updates.
