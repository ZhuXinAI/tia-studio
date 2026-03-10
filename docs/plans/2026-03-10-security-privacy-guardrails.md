# Security & Privacy Guardrails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable Mastra prompt-injection and PII guardrails, expose a Security & Privacy settings tab, and document the protections in the README.

**Architecture:** Store global guardrail preferences in `app_preferences`, expose them through a dedicated settings route, and resolve a global override provider for LLM-based detectors with assistant-model fallback. Apply `PromptInjectionDetector` to input processing and `PIIDetector` to both input and output processing inside `AssistantRuntimeService`.

**Tech Stack:** Electron, React, TypeScript, Hono, Vitest, Mastra processors

---

### Task 1: Add persisted security settings

**Files:**

- Create: `src/main/persistence/repos/security-settings-repo.ts`
- Create: `src/main/server/validators/security-settings-validator.ts`
- Create: `src/main/server/routes/security-settings-route.ts`
- Test: `src/main/server/routes/security-settings-route.test.ts`
- Modify: `src/main/server/create-app.ts`
- Modify: `src/main/index.ts`

**Step 1: Add the repository contract**

Implement a repository that reads and writes:

- `security.prompt_injection_enabled` (default `true`)
- `security.pii_detection_enabled` (default `true`)
- `security.guardrail_provider_id` (default `null`)

**Step 2: Add route validation**

Accept partial PATCH payloads for:

- `promptInjectionEnabled?: boolean`
- `piiDetectionEnabled?: boolean`
- `guardrailProviderId?: string | null`

Reject empty payloads and invalid provider ids.

**Step 3: Return a settings response**

Return current settings plus enabled providers with selected models so the renderer can populate the dropdown without a second request.

**Step 4: Cover the route**

Add tests for:

- defaults
- valid toggle updates
- valid provider override update
- invalid provider override rejection
- empty payload rejection

### Task 2: Wire guardrails into assistant runtime

**Files:**

- Modify: `src/main/mastra/assistant-runtime.ts`
- Test: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Resolve detector model source**

Read security settings during agent registration. If a valid override provider exists, use its configured model; otherwise fall back to the assistant’s own provider/model.

**Step 2: Add processors with safe defaults**

Configure:

- `PromptInjectionDetector` as an input processor when enabled
- `PIIDetector` as an input processor when enabled
- `BatchPartsProcessor` + `PIIDetector` as output processors when PII protection is enabled

Use default strategies that preserve UX while protecting data.

**Step 3: Update cache signatures**

Include guardrail settings and resolved override provider details in the agent signature so changes force re-registration.

**Step 4: Cover the runtime**

Add tests proving:

- the new processors are registered by default
- the override provider is used when configured
- disabled toggles remove the processors

### Task 3: Add the settings tab and documentation

**Files:**

- Create: `src/renderer/src/features/settings/security/security-settings-query.ts`
- Create: `src/renderer/src/features/settings/pages/security-settings-page.tsx`
- Test: `src/renderer/src/features/settings/pages/security-settings-page.test.tsx`
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`
- Modify: `src/renderer/src/features/settings/components/settings-sidebar-nav.tsx`
- Modify: `src/renderer/src/features/settings/pages/settings-page-layout.test.tsx`
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `README.md`

**Step 1: Add the tab**

Register `/settings/security`, add a sidebar item, and render a page titled “Security & Privacy”.

**Step 2: Add controls**

Render:

- a prompt-injection toggle
- a PII protection toggle
- a provider dropdown with a default “use assistant model” option

Persist changes immediately and show loading/saving states consistent with the existing settings pages.

**Step 3: Sync locales**

Add the new English copy and sync the locale files so missing keys inherit the English defaults.

**Step 4: Document behavior**

Add a `## Security` section to `README.md` describing the detectors, default-on behavior, override provider selection, and fallback to the assistant model.
