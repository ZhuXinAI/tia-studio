# Telegram Pairing Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the Telegram claw save UX so the dialog closes cleanly and the pairings dialog opens immediately after saving, while localizing Telegram-related UI copy.

**Architecture:** Keep the existing claws page flow, but let the save handler use the returned claw record from `createClaw`/`updateClaw` to decide whether to auto-open the pairings dialog. Update renderer copy to use the i18n locale files rather than hardcoded Telegram/Lark strings.

**Tech Stack:** React, TypeScript, Vitest, i18next

---

### Task 1: Add failing save-flow test

**Files:**
- Modify: `src/renderer/src/features/claws/pages/claws-page.test.tsx`

**Step 1: Write the failing test**
- Add a test covering: create a Telegram claw, submit, expect the editor dialog to close, and expect the pairings dialog to open for that claw.

**Step 2: Run test to verify it fails**
- Run: `npm test -- src/renderer/src/features/claws/pages/claws-page.test.tsx`
- Expected: FAIL because the current save flow only refreshes the page and never auto-opens pairings.

### Task 2: Implement minimal save-flow fix

**Files:**
- Modify: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Modify: `src/renderer/src/features/claws/claws-query.ts`

**Step 1: Implement minimal code**
- Use the returned claw record from save requests.
- Detect when the saved claw has a Telegram channel and should open pairings.
- Close the editor and immediately open/load the pairings dialog for that claw.

**Step 2: Run focused tests**
- Run: `npm test -- src/renderer/src/features/claws/pages/claws-page.test.tsx`
- Expected: PASS.

### Task 3: Add i18n coverage for Telegram UI

**Files:**
- Modify: `src/renderer/src/features/claws/components/claw-editor-dialog.tsx`
- Modify: `src/renderer/src/features/claws/components/claw-pairings-dialog.tsx`
- Modify: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `src/renderer/src/i18n/locales/de-DE.json`
- Modify: `src/renderer/src/i18n/locales/el-GR.json`
- Modify: `src/renderer/src/i18n/locales/es-ES.json`
- Modify: `src/renderer/src/i18n/locales/fr-FR.json`
- Modify: `src/renderer/src/i18n/locales/ja-JP.json`
- Modify: `src/renderer/src/i18n/locales/pt-PT.json`
- Modify: `src/renderer/src/i18n/locales/ro-RO.json`
- Modify: `src/renderer/src/i18n/locales/ru-RU.json`
- Modify: `src/renderer/src/i18n/locales/zh-CN.json`
- Modify: `src/renderer/src/i18n/locales/zh-HK.json`

**Step 1: Add/adjust translation keys**
- Replace hardcoded Telegram copy with translation lookups.
- Update existing Lark-only copy so it covers both Telegram and Lark.

**Step 2: Run focused tests**
- Run: `npm test -- src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx`
- Expected: PASS.

### Task 4: Verify end-to-end renderer regression safety

**Files:**
- No new files

**Step 1: Run broader verification**
- Run: `npm run typecheck && npm test`
- Expected: PASS.
