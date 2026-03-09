# Multilanguage Framework and Renderer UI Localization (Design)

## Context

TIA Studio currently ships all renderer copy inline in React components. The settings shell, page titles, button labels, helper text, and form affordances are all authored directly in JSX across `src/renderer/src/features/**` and `src/renderer/src/components/**`. There is no existing renderer i18n bootstrap, no locale catalog, and no shared string-loading convention.

The current settings experience already gives this work a natural entry point. Routing lives in `src/renderer/src/app/router.tsx`, settings navigation lives in `src/renderer/src/features/settings/components/settings-sidebar-nav.tsx`, and a small amount of UI preference persistence already exists through main-process IPC in `src/main/index.ts` with `ui-config.json` stored under Electron `userData`.

This feature should establish the multilanguage framework first, keep English as the single source of truth, populate mirrored locale files for every supported language, and expose a user-facing selector in a new `General Settings` page. The scope for this first effort is renderer UI only.

## Goals

- Add a renderer-only internationalization framework that works across the React app.
- Use `en-US` as the canonical translation source.
- Support these locale codes in v1:
  - `zh-CN`
  - `zh-HK`
  - `en-US`
  - `de-DE`
  - `ja-JP`
  - `ru-RU`
  - `el-GR`
  - `es-ES`
  - `fr-FR`
  - `pt-PT`
  - `ro-RO`
- Default the app language from the operating system locale.
- Allow users to override the system default from a new `General Settings` page.
- Persist the manual language override in app UI config.
- Store renderer strings in a large JSON catalog and keep locale files synchronized from the English source.
- Localize the shared settings shell and the first framework-facing UI surfaces as part of the initial rollout.

## Non-goals

- No localization of main-process log messages, server responses, backend validation errors, or IPC-only error payloads in this phase.
- No machine translation pipeline, external translation service integration, or remote locale downloads.
- No per-workspace or per-thread language settings.
- No attempt to localize date/time/number formatting beyond what the browser runtime already provides where needed.
- No restart requirement for changing the UI language.
- No multi-namespace translation architecture in v1 unless implementation pressure proves it necessary.

## Product Direction

### Renderer-first i18n

- Use `i18next` with `react-i18next` in the renderer only.
- Initialize locale resources during renderer bootstrap near `src/renderer/src/main.tsx`.
- Keep the API surface simple: components should read copy through `useTranslation()` and translation keys rather than inline literals.

### English source of truth

- `en-US.json` is the canonical string catalog.
- Every other locale file mirrors the same key tree as `en-US.json`.
- Missing keys in non-English files should be backfilled automatically from English source values so the application never depends on hand-maintained structural parity.
- v1 should use a single namespace such as `app` to avoid complexity while the translation surface is still modest.

### OS-default language with manual override

- On first launch, resolve the active locale from the operating system locale exposed by the main process.
- If the OS locale is not directly supported, map it to the nearest supported locale when possible, then fall back to `en-US`.
- Users can choose a manual override from the app UI.
- The persisted override should be optional; absence of an override means “follow system.”

### General Settings page

- Add a new `General Settings` page as the home of language preferences.
- Make `/settings` redirect to `/settings/general`.
- Keep `Display` focused on theme and transparent-window settings.
- The language selector should visually match the polished, native-label style shown in the reference screenshot, including native language labels and region-specific entries.

## Supported Locales

The locale selector and locale config should support these exact codes and human-facing labels:

- `zh-CN` — `中文`
- `zh-HK` — `中文（繁體）`
- `en-US` — `English`
- `de-DE` — `Deutsch`
- `ja-JP` — `日本語`
- `ru-RU` — `Русский`
- `el-GR` — `Ελληνικά`
- `es-ES` — `Español`
- `fr-FR` — `Français`
- `pt-PT` — `Português`
- `ro-RO` — `Română`

The selector UI should also include a `System Default` option. In persistence, that can be represented as a missing or `null` language override while the renderer uses a transient `system` option value internally for UI interactions.

## Architecture

### Renderer bootstrap

- Add an i18n bootstrap module under `src/renderer/src/i18n/`.
- The module should:
  - register locale resources
  - configure fallback language as `en-US`
  - resolve the initial effective locale
  - expose locale metadata helpers for UI rendering
- `src/renderer/src/main.tsx` should initialize i18n before the routed application renders so first paint uses the correct locale.

### Locale configuration module

A dedicated locale config module should define:

- the supported locale code list
- native display labels
- optional emoji or asset metadata for selector rendering
- the fallback locale
- mapping helpers from arbitrary OS locales to supported locales

This module is the single place to encode locale policy so components do not duplicate resolution logic.

### Main-process locale and UI config seam

`src/main/index.ts` already reads and writes `ui-config.json` for transparent window settings. Extend that seam instead of inventing a second preference store.

The UI config shape should become conceptually:

```ts
type UiConfig = {
  transparent?: boolean
  language?: string | null
}
```

Behavior:

- `language === null` or missing means “System Default”
- supported locale codes mean explicit override
- unsupported persisted values are ignored and treated as “System Default”

Add a focused IPC entry for system locale lookup, conceptually `tia:get-system-locale`, and expose it safely through preload.

### File layout

The implementation should introduce files conceptually like:

- `src/renderer/src/i18n/config.ts`
- `src/renderer/src/i18n/index.ts`
- `src/renderer/src/i18n/locales/en-US.json`
- `src/renderer/src/i18n/locales/zh-CN.json`
- `src/renderer/src/i18n/locales/zh-HK.json`
- `src/renderer/src/i18n/locales/de-DE.json`
- `src/renderer/src/i18n/locales/ja-JP.json`
- `src/renderer/src/i18n/locales/ru-RU.json`
- `src/renderer/src/i18n/locales/el-GR.json`
- `src/renderer/src/i18n/locales/es-ES.json`
- `src/renderer/src/i18n/locales/fr-FR.json`
- `src/renderer/src/i18n/locales/pt-PT.json`
- `src/renderer/src/i18n/locales/ro-RO.json`
- `src/renderer/src/features/settings/pages/general-settings-page.tsx`
- `src/renderer/src/features/settings/ui-config.ts`
- `scripts/sync-locale-files.mjs` or equivalent sync utility

## Locale Resolution and Data Flow

### Initial locale selection

At renderer startup:

1. Read the saved UI config override.
2. Read the system locale from Electron.
3. Normalize the system locale to the closest supported locale.
4. Compute the effective language:
   - explicit override if present and supported
   - otherwise resolved system locale
   - otherwise `en-US`
5. Initialize `i18next` with that effective language.

### Mapping behavior

Locale mapping should be deterministic and conservative. Examples:

- `en-US` stays `en-US`
- `en-GB` maps to `en-US`
- `zh-CN` and `zh-Hans-*` map to `zh-CN`
- `zh-HK`, `zh-TW`, and `zh-Hant-*` map to `zh-HK`
- unsupported locales such as `it-IT` fall back to `en-US`

### Runtime switching

When the user changes language in `General Settings`:

1. Update the saved UI config override.
2. Call `i18next.changeLanguage(...)`.
3. Rerender the active UI immediately.

No restart should be required, and the selector should always reflect the current effective language.

## Settings UX

### Navigation changes

- Add `General` to the settings sidebar.
- Make it the first settings category.
- Redirect `/settings` to `/settings/general` instead of `/settings/about`.
- Keep existing `Display` and `About & Feedback` pages, but move language concerns fully into `General`.

### General Settings page

The page should contain a language section with:

- page title and description
- a selector that includes `System Default`
- entries for every supported locale
- native labels for each language
- current effective-language hint when `System Default` is selected

Example UX:

- `System Default (English)`
- `System Default (中文)`

This makes it clear what the app is currently using without forcing the user to understand locale codes.

### Display Settings page

`Display Settings` should continue to own:

- theme
- transparent window

Language should be removed from `Display` if any related UI is temporarily placed there during implementation.

## Translation Catalog Strategy

### Catalog structure

Start with one JSON namespace rooted under `app`. Organize keys by feature and page, for example:

```json
{
  "settings": {
    "sidebar": {
      "title": "Settings",
      "subtitle": "Configuration"
    },
    "general": {
      "title": "General Settings",
      "description": "Manage language and core app preferences."
    },
    "display": {
      "title": "Display Settings"
    }
  }
}
```

The exact key tree can evolve, but it should remain:

- nested by feature
- stable once introduced
- human-readable enough to review in JSON

### Sync workflow

Add a small utility that:

- reads `en-US.json`
- ensures every locale file exists
- recursively adds missing keys to each locale file
- uses English source values as placeholders when translations are missing
- preserves existing translated values
- writes consistent formatting back to disk

This utility is the foundation for the “large JSON source populates every language file” workflow.

Recommended script surface:

- `pnpm run i18n:sync`

That script can be run whenever new English strings are added.

## Migration Strategy

### Phase 1: framework and shell

Localize the highest-leverage renderer surfaces first:

- settings sidebar labels
- `General Settings` page
- `Display Settings` page
- shared settings titles and descriptions
- any app-shell copy touched while wiring the framework

This phase proves the framework, selector, persistence, and fallback behavior without rewriting every page at once.

### Phase 2: feature-by-feature expansion

Migrate remaining renderer pages in manageable batches:

- about/settings support surfaces
- provider settings
- MCP settings
- web search settings
- thread and team UI
- claws UI

This phased rollout reduces regression risk and keeps reviews focused.

## Error Handling

- If the system locale IPC fails, use `en-US`.
- If `ui-config.json` is missing or malformed, use default config behavior and continue.
- If the persisted override is unsupported, ignore it and fall back to system resolution.
- If a locale file is missing at runtime, the build should fail early during development rather than silently shipping partial assets.
- If a translation key is missing in the active locale, `i18next` should fall back to `en-US`.
- Renderer wrappers may translate surrounding UI affordances, but raw backend error strings can remain untranslated in this phase.

## Testing

Add focused coverage for:

- locale resolution from arbitrary OS locales to supported locales
- effective locale precedence for `override > system > en-US fallback`
- settings routing redirect from `/settings` to `/settings/general`
- settings sidebar rendering the new `General` entry
- `General Settings` selector showing supported locales
- language switching updating rendered copy without reload
- sync script backfilling missing locale keys from `en-US`

Existing settings tests should be updated rather than duplicated where possible.

## Rollout Recommendation

Keep the first implementation intentionally narrow but production-grade:

- renderer i18n framework
- locale config and fallback rules
- persisted language override
- new `General Settings` page
- translation sync utility
- initial settings-shell localization

Once that base is stable, expand renderer coverage page by page until the full UI is localized.
