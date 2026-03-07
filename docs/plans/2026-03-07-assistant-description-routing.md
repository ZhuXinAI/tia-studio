# Assistant Description Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-class assistant description field so the team supervisor can reliably choose the right member for delegation.

**Architecture:** Extend the persisted assistant model and API with an optional `description` column, thread it through the renderer editor/query types, and pass it into Mastra member agents. Strengthen the supervisor prompt by including each member's description in the team roster so delegation still has explicit routing context even if Mastra's internal agent description handling changes.

**Tech Stack:** Electron, React, TypeScript, Hono, SQLite/libsql, Vitest, Mastra

---

### Task 1: Persist assistant descriptions

**Files:**
- Modify: `src/main/persistence/migrations/0001_app_core.sql`
- Modify: `src/main/persistence/migrations/0001_app_core.ts`
- Modify: `src/main/persistence/migrate.ts`
- Modify: `src/main/persistence/migrate.test.ts`
- Modify: `src/main/persistence/migrate-fallback.test.ts`
- Modify: `src/main/persistence/repos/assistants-repo.ts`
- Test: `src/main/server/routes/assistants-route.test.ts`

**Step 1: Write the failing tests**

- Add migration assertions for a new `description` column on `app_assistants`.
- Add route assertions proving `POST /v1/assistants` and `PATCH /v1/assistants/:assistantId` accept and return `description`.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/server/routes/assistants-route.test.ts`

Expected: failures referencing the missing assistant `description` column/field.

**Step 3: Write minimal implementation**

- Add `description TEXT NOT NULL DEFAULT ''` to assistant table creation.
- Add fallback migration logic to append the column when upgrading older databases.
- Extend assistant repository types, row parsing, insert, update, and select statements.
- Extend assistant route validation schemas to accept optional `description`.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/server/routes/assistants-route.test.ts`

Expected: PASS

### Task 2: Expose description to team routing

**Files:**
- Modify: `src/main/mastra/team-runtime.ts`
- Test: `src/main/mastra/team-runtime.test.ts`

**Step 1: Write the failing tests**

- Assert member agents are created with `description`.
- Assert supervisor instructions list team members with descriptions when present.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/main/mastra/team-runtime.test.ts`

Expected: failures because member `description` is not passed through and the roster only includes names.

**Step 3: Write minimal implementation**

- Pass `assistant.description` into each member `Agent`.
- Update `buildSupervisorInstructions()` to include `name: description` when a description exists, and fall back to just `name` otherwise.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/main/mastra/team-runtime.test.ts`

Expected: PASS

### Task 3: Add description to the assistant editor

**Files:**
- Modify: `src/renderer/src/features/assistants/assistants-query.ts`
- Modify: `src/renderer/src/features/assistants/assistant-editor.tsx`
- Test: `src/renderer/src/features/assistants/assistant-editor.test.tsx`

**Step 1: Write the failing tests**

- Assert initial assistant descriptions populate the editor.
- Assert submit payload includes `description`.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/renderer/src/features/assistants/assistant-editor.test.tsx`

Expected: failures because the field is not rendered or submitted.

**Step 3: Write minimal implementation**

- Extend renderer assistant types with `description`.
- Add a new description field with concise help text in the assistant editor.
- Include trimmed `description` in the submit payload.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/renderer/src/features/assistants/assistant-editor.test.tsx`

Expected: PASS

### Task 4: Verify integrated behavior

**Files:**
- Verify only

**Step 1: Run focused verification**

Run: `npm test -- src/main/persistence/migrate.test.ts src/main/persistence/migrate-fallback.test.ts src/main/server/routes/assistants-route.test.ts src/main/mastra/team-runtime.test.ts src/renderer/src/features/assistants/assistant-editor.test.tsx`

Expected: PASS with no new failures in the touched areas.
