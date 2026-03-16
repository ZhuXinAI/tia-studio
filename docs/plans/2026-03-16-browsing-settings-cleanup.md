# Browsing Settings Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the old web-search-focused settings with clearer browsing-mode settings, add a persisted TIA browser visibility preference, and remove the unused default search-engine configuration.

**Architecture:** Keep the existing `/v1/settings/web-search` endpoint and settings page route for compatibility, but simplify the underlying data model to only the browsing-related booleans plus browser automation mode. Mirror the existing built-in-browser visibility sync for the TIA browser runtime so the main process and settings UI stay consistent.

**Tech Stack:** Electron, Hono, React, TypeScript, Vitest, i18next JSON locale files.

---

### Task 1: Simplify Browsing Settings Storage

**Files:**
- Modify: `src/main/persistence/repos/web-search-settings-repo.ts`
- Modify: `src/main/server/validators/web-search-validator.ts`
- Modify: `src/main/server/routes/web-search-settings-route.ts`
- Modify: `src/main/server/routes/web-search-settings-route.test.ts`
- Modify: `src/renderer/src/features/settings/web-search/web-search-query.ts`

**Step 1: Write the failing tests**

Update route/query tests to remove `defaultEngine` and assert the new TIA browser visibility setting is returned and patchable.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/main/server/routes/web-search-settings-route.test.ts`

**Step 3: Write minimal implementation**

Remove the default-engine preference from the settings repo and route payloads, add a persisted TIA browser visibility preference, and keep the existing browser automation mode plus built-in-browser visibility settings.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/main/server/routes/web-search-settings-route.test.ts`

**Step 5: Commit**

```bash
git add src/main/persistence/repos/web-search-settings-repo.ts src/main/server/validators/web-search-validator.ts src/main/server/routes/web-search-settings-route.ts src/main/server/routes/web-search-settings-route.test.ts src/renderer/src/features/settings/web-search/web-search-query.ts
git commit -m "refactor: simplify browsing settings storage"
```

### Task 2: Wire Runtime Visibility Preferences

**Files:**
- Modify: `src/main/tia-browser-tool.ts`
- Modify: `src/main/tia-browser-tool-manager.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/tia-browser-tool-manager.test.ts`

**Step 1: Write the failing test**

Add a manager/runtime test that proves the TIA browser runtime launches with a configurable initial `show` value.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/main/tia-browser-tool-manager.test.ts src/main/tia-browser-tool.test.ts`

**Step 3: Write minimal implementation**

Add a `show` runtime option, pass it into `new BrowserWindow({ show })`, and sync that preference from the main process both on startup and when the user updates settings.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/main/tia-browser-tool-manager.test.ts src/main/tia-browser-tool.test.ts`

**Step 5: Commit**

```bash
git add src/main/tia-browser-tool.ts src/main/tia-browser-tool-manager.ts src/main/index.ts src/main/tia-browser-tool-manager.test.ts src/main/tia-browser-tool.test.ts
git commit -m "feat: add tia browser visibility setting"
```

### Task 3: Redesign the Settings Page as Browsing

**Files:**
- Modify: `src/renderer/src/features/settings/pages/web-search-settings-page.tsx`
- Modify: `src/renderer/src/features/settings/pages/web-search-settings-page.test.tsx`
- Modify: `src/renderer/src/features/settings/components/settings-sidebar-nav.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `src/renderer/src/i18n/locales/*.json`

**Step 1: Write the failing test**

Update the page tests to expect the “Browsing” label, no search-engine cards, and mode-specific toggles for TIA Browser Tool vs Built-in Browser.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/src/features/settings/pages/web-search-settings-page.test.tsx src/renderer/src/app/router.test.tsx`

**Step 3: Write minimal implementation**

Rename the section labels from “Web Search” to “Browsing”, replace the current mixed toggle list with mode-specific controls, and rename the switches to match their actual behavior.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/renderer/src/features/settings/pages/web-search-settings-page.test.tsx src/renderer/src/app/router.test.tsx`

**Step 5: Commit**

```bash
git add src/renderer/src/features/settings/pages/web-search-settings-page.tsx src/renderer/src/features/settings/pages/web-search-settings-page.test.tsx src/renderer/src/features/settings/components/settings-sidebar-nav.tsx src/renderer/src/app/router.test.tsx src/renderer/src/i18n/locales/*.json
git commit -m "feat: simplify browsing settings UI"
```

### Task 4: Validate Integration

**Files:**
- Modify: any files above as needed

**Step 1: Run focused tests**

Run: `npm run test -- src/main/server/routes/web-search-settings-route.test.ts src/main/tia-browser-tool-manager.test.ts src/main/tia-browser-tool.test.ts src/renderer/src/features/settings/pages/web-search-settings-page.test.tsx src/renderer/src/app/router.test.tsx`

**Step 2: Run type checks and build**

Run: `npm run build`

**Step 3: Summarize remaining gaps**

Document any remaining naming debt such as the legacy `/settings/web-search` route path if we intentionally keep it for compatibility.

**Step 4: Commit**

```bash
git add .
git commit -m "test: validate browsing settings cleanup"
```
