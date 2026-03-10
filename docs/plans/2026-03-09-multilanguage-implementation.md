# Multilanguage Framework and Renderer UI Localization Implementation Plan

**Goal:** Introduce renderer-only i18n with `en-US` as the source catalog, add system-locale detection plus a persisted manual override, create a new `General Settings` page with language selection, and localize the shared settings shell plus initial settings surfaces.

**Architecture:** Add a dedicated renderer i18n bootstrap under `src/renderer/src/i18n`, extend the existing main-process `ui-config.json` seam for language override storage, expose system locale through preload IPC, and keep locale JSON files synchronized from the canonical `en-US.json` catalog with a small script.

**Tech Stack:** Electron 39, React 19, React Router 7, TypeScript 5, `i18next`, `react-i18next`, Vitest 4

---

### Task 1: Lock locale resolution behavior in tests

**Files:**

- Create: `src/renderer/src/i18n/config.ts`
- Create: `src/renderer/src/i18n/config.test.ts`

**Step 1: Write the failing test**

Add focused coverage for:

- supported locale metadata for all 11 locale codes
- system-locale mapping such as `en-GB -> en-US`
- Chinese script/region mapping such as `zh-TW -> zh-HK` and `zh-Hans-CN -> zh-CN`
- fallback to `en-US` for unsupported locales
- effective locale precedence for explicit override over system locale

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/i18n/config.test.ts
```

Expected: FAIL because the locale config module does not exist yet.

**Step 3: Write minimal implementation**

- Define the supported locale list and native labels.
- Implement helpers for:
  - `isSupportedLocale`
  - `resolveSupportedLocale`
  - `resolveEffectiveLocale`
  - `getLocaleOptionLabel`
- Keep `en-US` as the single hard fallback.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/i18n/config.test.ts
```

Expected: PASS

---

### Task 2: Extend UI config and system locale IPC

**Files:**

- Create: `src/main/ui-config.ts`
- Create: `src/main/ui-config.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Step 1: Write the failing test**

Add coverage for:

- default empty UI config when the file does not exist
- normalization of `transparent` and `language` values
- unsupported language overrides being dropped
- writing merged config updates without losing existing keys

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/main/ui-config.test.ts
```

Expected: FAIL because the reusable UI config module does not exist yet.

**Step 3: Write minimal implementation**

- Extract `ui-config.json` read/write logic from `src/main/index.ts` into `src/main/ui-config.ts`.
- Extend the config shape with `language?: string | null`.
- Add a focused IPC handler such as `tia:get-system-locale`.
- Expose safe preload helpers for:
  - reading UI config
  - writing UI config
  - reading system locale

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/main/ui-config.test.ts
```

Expected: PASS

---

### Task 3: Bootstrap renderer i18n and add General Settings routing

**Files:**

- Create: `src/renderer/src/i18n/index.ts`
- Create: `src/renderer/src/features/settings/pages/general-settings-page.tsx`
- Create: `src/renderer/src/features/settings/pages/general-settings-page.test.tsx`
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`
- Modify: `src/renderer/src/features/settings/components/settings-sidebar-nav.tsx`
- Modify: `src/renderer/src/features/settings/pages/settings-page-layout.tsx`

**Step 1: Write the failing test**

Add assertions for:

- `/settings` redirecting to `/settings/general`
- `General` appearing in the settings sidebar
- `General Settings` rendering the language selector
- the selector showing `System Default` plus the supported locales

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/app/router.test.tsx src/renderer/src/features/settings/pages/general-settings-page.test.tsx
```

Expected: FAIL because the route and page do not exist yet.

**Step 3: Write minimal implementation**

- Initialize `i18next` before rendering the routed app.
- Create `GeneralSettingsPage` with a language selector card.
- Add the new route and sidebar entry.
- Make `/settings` redirect to `/settings/general`.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/app/router.test.tsx src/renderer/src/features/settings/pages/general-settings-page.test.tsx
```

Expected: PASS

---

### Task 4: Localize the settings shell and initial settings pages

**Files:**

- Modify: `src/renderer/src/features/settings/components/settings-sidebar-nav.tsx`
- Modify: `src/renderer/src/features/settings/pages/general-settings-page.tsx`
- Modify: `src/renderer/src/features/settings/pages/display-settings-page.tsx`
- Modify: `src/renderer/src/features/settings/pages/display-settings-page.test.tsx`

**Step 1: Write the failing test**

Add coverage for:

- translated sidebar labels rendering from the active locale
- `Display Settings` strings resolving through translation keys
- changing the selected language updating rendered text without reload

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/settings/pages/display-settings-page.test.tsx src/renderer/src/features/settings/pages/general-settings-page.test.tsx
```

Expected: FAIL because the current pages still use inline English strings.

**Step 3: Write minimal implementation**

- Replace inline strings with translation keys on the settings shell and initial settings pages.
- Wire the language selector to save the override and call `i18next.changeLanguage(...)`.
- Keep theme and transparent-window behavior unchanged.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/settings/pages/display-settings-page.test.tsx src/renderer/src/features/settings/pages/general-settings-page.test.tsx
```

Expected: PASS

---

### Task 5: Add locale catalogs and sync automation

**Files:**

- Create: `src/renderer/src/i18n/locales/en-US.json`
- Create: `src/renderer/src/i18n/locales/zh-CN.json`
- Create: `src/renderer/src/i18n/locales/zh-HK.json`
- Create: `src/renderer/src/i18n/locales/de-DE.json`
- Create: `src/renderer/src/i18n/locales/ja-JP.json`
- Create: `src/renderer/src/i18n/locales/ru-RU.json`
- Create: `src/renderer/src/i18n/locales/el-GR.json`
- Create: `src/renderer/src/i18n/locales/es-ES.json`
- Create: `src/renderer/src/i18n/locales/fr-FR.json`
- Create: `src/renderer/src/i18n/locales/pt-PT.json`
- Create: `src/renderer/src/i18n/locales/ro-RO.json`
- Create: `scripts/sync-locale-files.mjs`
- Create: `scripts/sync-locale-files.test.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

Add coverage for:

- creating missing locale files from `en-US`
- recursively backfilling missing keys in existing locale files
- preserving already translated values

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- scripts/sync-locale-files.test.ts
```

Expected: FAIL because the sync utility does not exist yet.

**Step 3: Write minimal implementation**

- Create the initial English catalog for the settings shell and initial settings pages.
- Seed every supported locale file with the same key tree.
- Implement the sync utility and add an `i18n:sync` package script.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- scripts/sync-locale-files.test.ts
```

Expected: PASS

---

### Task 6: Run focused verification

**Step 1: Run main-process verification**

```bash
npm run test -- src/main/ui-config.test.ts
```

**Step 2: Run renderer i18n verification**

```bash
npm run test -- src/renderer/src/i18n/config.test.ts src/renderer/src/app/router.test.tsx src/renderer/src/features/settings/pages/general-settings-page.test.tsx src/renderer/src/features/settings/pages/display-settings-page.test.tsx
```

**Step 3: Run sync-script verification**

```bash
npm run test -- scripts/sync-locale-files.test.ts
```

**Step 4: Run typecheck**

```bash
npm run typecheck
```
