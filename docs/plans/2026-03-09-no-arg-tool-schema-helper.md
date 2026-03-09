# No-Arg Tool Schema Helper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a shared helper for Mastra no-argument tools so OpenAI Responses always receives a root object schema.

**Architecture:** Introduce a tiny schema helper in the Mastra tools area that returns the approved empty-object Zod schema shape. Migrate current no-arg tools to use it, and lock behavior with helper-level and tool-level tests that exercise Mastra's OpenAI compatibility layer.

**Tech Stack:** TypeScript, Zod, Mastra, Vitest

---

### Task 1: Add helper-level regression test

**Files:**
- Create: `docs/plans/2026-03-09-no-arg-tool-schema-helper.md`
- Modify: `src/main/mastra/tools/tool-schema.test.ts`

**Step 1: Write the failing test**

```ts
it('keeps no-arg tool schemas as a root object for OpenAI Responses', () => {
  const model = resolveModel({
    type: 'openai-response',
    apiKey: 'test-key',
    selectedModel: 'gpt-4.1'
  })

  const coreTool = makeCoreTool(
    createTool({
      id: 'no-arg-test-tool',
      description: 'Test tool',
      inputSchema: createNoArgToolInputSchema(),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async () => ({ ok: true })
    }),
    {
      name: 'noArgTestTool',
      model,
      requestContext: new RequestContext()
    },
    'tool'
  )

  const parameters = 'jsonSchema' in coreTool.parameters
    ? coreTool.parameters.jsonSchema
    : coreTool.parameters

  expect(parameters).toMatchObject({
    type: 'object',
    properties: {},
    additionalProperties: false
  })
  expect(parameters).not.toHaveProperty('anyOf')
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/mastra/tools/tool-schema.test.ts`
Expected: FAIL because the helper file and export do not exist yet.

**Step 3: Write minimal implementation**

Create a shared helper that returns `z.object({})` without top-level default/optional/nullable wrappers.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/mastra/tools/tool-schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/tools/tool-schema.ts src/main/mastra/tools/tool-schema.test.ts
git commit -m "refactor: add no-arg tool schema helper"
```

### Task 2: Migrate current no-arg tools

**Files:**
- Modify: `src/main/mastra/tools/work-log-tools.ts`
- Modify: `src/main/mastra/tools/soul-memory-tools.ts`
- Modify: `src/main/mastra/tools/work-log-tools.test.ts`

**Step 1: Write the failing test**

Extend existing tests so current no-arg tools use the shared helper contract, with `readSoulMemory` and `listWorkLogs` both producing a root object schema through Mastra/OpenAI compatibility.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/mastra/tools/tool-schema.test.ts src/main/mastra/tools/work-log-tools.test.ts`
Expected: FAIL until both tools are migrated.

**Step 3: Write minimal implementation**

Replace inline `z.object({})` no-arg schemas with `createNoArgToolInputSchema()` in both tool modules.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/mastra/tools/tool-schema.test.ts src/main/mastra/tools/work-log-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/tools/work-log-tools.ts src/main/mastra/tools/soul-memory-tools.ts src/main/mastra/tools/work-log-tools.test.ts
git commit -m "refactor: reuse no-arg tool input schema"
```

### Task 3: Verify adjacent runtime behavior

**Files:**
- Test: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Run focused integration verification**

Run: `pnpm vitest run src/main/mastra/tools/tool-schema.test.ts src/main/mastra/tools/work-log-tools.test.ts src/main/mastra/assistant-runtime.test.ts`
Expected: PASS with no failing tests.

**Step 2: Review for unnecessary churn**

Confirm the helper stays narrow, generic for future no-arg tools, and does not change runtime tool behavior beyond schema serialization.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-09-no-arg-tool-schema-helper.md
git commit -m "docs: add no-arg tool schema helper plan"
```
