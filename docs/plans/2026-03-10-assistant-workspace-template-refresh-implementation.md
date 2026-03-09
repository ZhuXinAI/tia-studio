# Assistant Workspace Template Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh TIA Studio's default assistant workspace boilerplate by copying and adapting the richer gateway `IDENTITY.md` and `SOUL.md` templates while improving `MEMORY.md` and `HEARTBEAT.md` to match.

**Architecture:** Keep the existing four-file assistant workspace bootstrap contract intact and replace only the template content in `assistant-workspace.ts`. Strengthen the related Vitest coverage so the tests validate meaningful template text rather than only markdown headings.

**Tech Stack:** TypeScript, Node filesystem utilities, Vitest

---

### Task 1: Strengthen the assistant workspace bootstrap tests

**Files:**

- Modify: `src/main/mastra/assistant-workspace.test.ts`

**Step 1: Write the failing test**

Add assertions that the generated files contain stable content from the richer boilerplate, for example:

```ts
await expect(readFile(path.join(workspaceRoot, 'IDENTITY.md'), 'utf8')).resolves.toContain(
  '**Name:**'
)
await expect(readFile(path.join(workspaceRoot, 'SOUL.md'), 'utf8')).resolves.toContain(
  'Be genuinely helpful'
)
await expect(readFile(path.join(workspaceRoot, 'MEMORY.md'), 'utf8')).resolves.toContain(
  'Curated long-term memory'
)
await expect(readFile(path.join(workspaceRoot, 'HEARTBEAT.md'), 'utf8')).resolves.toContain(
  'skip heartbeat'
)
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/main/mastra/assistant-workspace.test.ts
```

Expected: FAIL because the current template strings are still short placeholders.

**Step 3: Write minimal implementation**

Do not change runtime behavior. Only update the test expectations to pin the desired richer template content.

**Step 4: Run test to verify it fails for the right reason**

Run:

```bash
npm run test -- src/main/mastra/assistant-workspace.test.ts
```

Expected: FAIL on missing template phrases, not on unrelated setup errors.

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-workspace.test.ts
git commit -m "test: pin assistant workspace template content"
```

---

### Task 2: Refresh the assistant workspace template text

**Files:**

- Modify: `src/main/mastra/assistant-workspace.ts`
- Modify: `src/main/mastra/assistant-workspace.test.ts`

**Step 1: Write the minimal implementation**

Replace the placeholder strings in `assistantWorkspaceTemplates` with adapted copy:

- `IDENTITY.md` uses the gateway identity scaffold
- `SOUL.md` uses the gateway soul guidance
- `MEMORY.md` explains what to record and how to keep it curated
- `HEARTBEAT.md` keeps the opt-in heartbeat behavior explicit

**Step 2: Run the focused test**

Run:

```bash
npm run test -- src/main/mastra/assistant-workspace.test.ts
```

Expected: PASS

**Step 3: Run adjacent verification**

Run:

```bash
npm run test -- src/main/mastra/assistant-runtime.test.ts src/main/mastra/tools/soul-memory-tools.test.ts
```

Expected: PASS because the file names and bootstrap contract are unchanged.

**Step 4: Commit**

```bash
git add src/main/mastra/assistant-workspace.ts src/main/mastra/assistant-workspace.test.ts
git commit -m "feat: refresh assistant workspace templates"
```
