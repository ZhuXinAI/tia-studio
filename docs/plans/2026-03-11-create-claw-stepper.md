# Create Claw Stepper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the create-claw modal with a guided three-step flow while leaving the edit-claw dialog behavior unchanged.

**Architecture:** Split the current `ClawEditorDialog` into a create-only flow and an edit-only flow. Reuse the existing provider/channel selector logic by adding an inline rendering mode so create uses selector content directly inside the main dialog instead of opening nested dialogs.

**Tech Stack:** React, TypeScript, Radix Dialog, Vitest, i18next

---

### Task 1: Split create and edit dialog behavior

**Files:**

- Modify: `src/renderer/src/features/claws/components/claw-editor-dialog.tsx`
- Create: `src/renderer/src/features/claws/components/claw-dialog-stepper.tsx`

**Step 1: Create create-flow-only state**

- Add a dedicated create branch with step state, larger dialog sizing, localized default assistant name, and name input focus.

**Step 2: Keep edit flow stable**

- Preserve the existing edit dialog layout and submit behavior for channel attach/detach and workspace read-only rules.

### Task 2: Make provider selector render inline

**Files:**

- Modify: `src/renderer/src/features/claws/components/claw-provider-selector-dialog.tsx`

**Step 1: Add inline presentation mode**

- Support rendering selector/template/form content without Radix modal wrappers.

**Step 2: Sync selection immediately in inline mode**

- Apply provider changes directly to the parent create dialog while keeping dialog-mode apply/cancel behavior unchanged.

### Task 3: Make channel selector render inline

**Files:**

- Modify: `src/renderer/src/features/claws/components/claw-channel-selector-dialog.tsx`

**Step 1: Add inline presentation mode**

- Render selector/create-edit/remove content directly in the create dialog.

**Step 2: Preserve edit dialog behavior**

- Keep the current modal flow for the edit-claw path.

### Task 4: Add copy and tests

**Files:**

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
- Modify: `src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx`

**Step 1: Add stepper copy**

- Add localized step labels, navigation labels, helper copy, and the default assistant name.

**Step 2: Cover the new create flow**

- Update create-dialog tests for step navigation, inline provider/channel selection, and final submit payload.

**Step 3: Run targeted validation**

- Run the claw dialog and selector tests to verify the refactor.
