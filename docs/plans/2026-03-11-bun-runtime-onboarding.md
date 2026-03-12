# Bun Runtime Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix managed Bun installs on macOS and add Bun + recommended skill onboarding inside Runtime Setup.

**Architecture:** Tighten Bun release asset selection in the main-process runtime manager so it ignores profile archives that do not contain the expected `bun` binary. Then extend the Runtime Setup renderer flow with a Bun-first onboarding card and a follow-up recommended-skills step that invokes `bunx skills add` through the managed Bun runtime only after Bun is ready.

**Tech Stack:** Electron, React, TypeScript, Vitest, Bun release downloads, Vercel `skills` CLI

---

### Task 1: Fix Bun release asset selection

**Files:**
- Modify: `src/main/runtimes/managed-runtime-service.ts`
- Modify: `src/main/runtimes/managed-runtime-service.test.ts`

**Step 1: Write the failing test**

Add coverage that passes both `bun-darwin-aarch64-profile.zip` and `bun-darwin-aarch64.zip` into `ManagedRuntimeService.selectReleaseAsset()` and asserts the standard archive is chosen.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/runtimes/managed-runtime-service.test.ts`

Expected: FAIL because profile builds currently match the loose substring lookup first.

**Step 3: Write minimal implementation**

- Replace the broad substring match with a preferred-match flow that:
  - first prefers exact archive names for known runtime assets,
  - then falls back safely without selecting `-profile` Bun assets.
- Keep UV selection behavior unchanged for supported assets.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/runtimes/managed-runtime-service.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/runtimes/managed-runtime-service.ts src/main/runtimes/managed-runtime-service.test.ts
git commit -m "fix: prefer installable bun release assets"
```

---

### Task 2: Add managed Bun skill-install APIs

**Files:**
- Modify: `src/main/skills/skills-manager.ts`
- Modify: `src/main/skills/skills-manager.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/src/env.d.ts`
- Modify: `src/renderer/src/features/settings/runtimes/managed-runtimes-query.ts`

**Step 1: Write the failing test**

Add main-process test coverage that:

- installs the requested recommended skill IDs in order,
- runs `bunx skills add <repo> --skill <name>` through the managed Bun path,
- appends the non-interactive flags needed for a global Claude-compatible install.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/skills/skills-manager.test.ts`

Expected: FAIL because no recommended-skill installer exists yet.

**Step 3: Write minimal implementation**

- Add a recommended skill definition list for:
  - `agent-browser`
  - `find-skills`
- Add a helper that installs selected skills with managed `bunx`.
- Expose a new IPC bridge for installing the selected onboarding skills from the renderer.
- Add the renderer query wrapper and types for those onboarding skill IDs.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/skills/skills-manager.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/skills/skills-manager.ts src/main/skills/skills-manager.test.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts src/renderer/src/env.d.ts src/renderer/src/features/settings/runtimes/managed-runtimes-query.ts
git commit -m "feat: add managed bun skill onboarding install api"
```

---

### Task 3: Add Bun-first onboarding UI to Runtime Setup

**Files:**
- Modify: `src/renderer/src/features/settings/pages/runtime-setup-page.tsx`
- Modify: `src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx`
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `src/renderer/src/i18n/locales/zh-CN.json`
- Modify: `src/renderer/src/i18n/locales/zh-HK.json`
- Modify: `src/renderer/src/i18n/locales/de-DE.json`
- Modify: `src/renderer/src/i18n/locales/ja-JP.json`
- Modify: `src/renderer/src/i18n/locales/ru-RU.json`
- Modify: `src/renderer/src/i18n/locales/el-GR.json`
- Modify: `src/renderer/src/i18n/locales/es-ES.json`
- Modify: `src/renderer/src/i18n/locales/fr-FR.json`
- Modify: `src/renderer/src/i18n/locales/pt-PT.json`
- Modify: `src/renderer/src/i18n/locales/ro-RO.json`

**Step 1: Write the failing test**

Extend the Runtime Setup page test to cover:

- a Bun onboarding card that explains Bun is the first recommended step,
- a disabled skills step when Bun is not ready,
- a recommended-skills section with `agent-browser` and `find-skills` toggles once Bun is ready.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx`

Expected: FAIL because the onboarding UI does not exist yet.

**Step 3: Write minimal implementation**

- Add a compact onboarding section above the runtime cards.
- Keep Bun install actions wired to the existing runtime actions.
- Only show the skill installer controls once Bun is ready.
- Default both recommended skills to enabled.
- Add a button that installs only the selected skills.
- Add the new locale copy in `en-US.json`, then sync missing keys into the other locale files.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/settings/pages/runtime-setup-page.tsx src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx src/renderer/src/i18n/locales/en-US.json src/renderer/src/i18n/locales/zh-CN.json src/renderer/src/i18n/locales/zh-HK.json src/renderer/src/i18n/locales/de-DE.json src/renderer/src/i18n/locales/ja-JP.json src/renderer/src/i18n/locales/ru-RU.json src/renderer/src/i18n/locales/el-GR.json src/renderer/src/i18n/locales/es-ES.json src/renderer/src/i18n/locales/fr-FR.json src/renderer/src/i18n/locales/pt-PT.json src/renderer/src/i18n/locales/ro-RO.json
git commit -m "feat: add bun runtime onboarding flow"
```
