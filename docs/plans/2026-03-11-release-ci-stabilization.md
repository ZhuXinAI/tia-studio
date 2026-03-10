# Release CI Stabilization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore the failing Claws test suites, then ensure package releases only start after CI has succeeded.

**Architecture:** Update the renderer tests to match the current Claws provider/channel selector and action-menu UI rather than reverting production code. Then tighten the release workflow so release jobs are triggered only from a successful CI run on a version tag, and add a reusable local preflight script for release/version commands.

**Tech Stack:** React 19, Vitest, Electron Vite, GitHub Actions, pnpm/npm scripts

---

### Task 1: Repair `ClawEditorDialog` tests for the current form flow

**Files:**

- Modify: `src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx`

**Step 1: Write the failing test**

Run: `pnpm vitest run src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx`
Expected: FAIL because the test still targets removed `claw-provider` and `claw-instructions` fields.

**Step 2: Update the test interactions**

- Open the provider selector with `button[id="claw-select-provider-button"]`
- Select the configured provider with `button[data-provider-id="provider-1"]`
- Apply the provider with `button[id="claw-provider-selector-apply"]`
- Remove expectations for `workspacePath: null` because the current dialog omits that field when empty

**Step 3: Re-run the focused suite**

Run: `pnpm vitest run src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx`
Expected: PASS

### Task 2: Repair `ClawsPage` tests for the current card and dialog flow

**Files:**

- Modify: `src/renderer/src/features/claws/pages/claws-page.test.tsx`

**Step 1: Write the failing test**

Run: `pnpm vitest run src/renderer/src/features/claws/pages/claws-page.test.tsx`
Expected: FAIL because the test still expects inline enable/delete buttons and old provider form fields.

**Step 2: Update the page helpers and flows**

- Add helper functions for opening the card actions menu, selecting providers, and selecting channels
- Assert visible summary text instead of hidden dropdown item text
- Trigger enable/disable/delete actions from the dropdown menu
- Drive creation flows through the provider selector dialog before channel selection

**Step 3: Re-run the focused suite**

Run: `pnpm vitest run src/renderer/src/features/claws/pages/claws-page.test.tsx`
Expected: PASS

### Task 3: Gate releases on successful CI

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `package.json`

**Step 1: Write the failing/unsafe behavior down**

- Current state: `release.yml` duplicates CI on tag pushes instead of waiting for the standalone CI workflow to finish
- Current state: version scripts push tags without a local `lint + typecheck + test + build` preflight

**Step 2: Implement the release gate**

- Expand `ci.yml` so it runs for normal pushes/PRs and tagged releases
- Trigger `release.yml` from successful `CI` workflow completions on `v*` tags
- Add a reusable `ci:release` script and make version scripts run it before pushing tags

**Step 3: Re-run focused verification**

Run: `pnpm run lint && pnpm run typecheck && pnpm run test`
Expected: PASS

### Task 4: Validate the full repo and ship

**Files:**

- No new files beyond the changes above

**Step 1: Run local verification**

Run: `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`
Expected: PASS

**Step 2: Commit and push**

```bash
git add docs/plans/2026-03-11-release-ci-stabilization.md \
  src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx \
  src/renderer/src/features/claws/pages/claws-page.test.tsx \
  .github/workflows/ci.yml \
  .github/workflows/release.yml \
  package.json
git commit -m "fix: stabilize release ci"
git push
```

**Step 3: Watch GitHub Actions**

Run: `gh run list --limit 10`
Expected: CI succeeds first and the release workflow starts only after that success.
