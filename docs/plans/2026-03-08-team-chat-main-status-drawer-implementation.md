# Team Chat Main Surface and Status Drawer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Team chat the primary Team page surface again, move status into a right-side drawer, fix the Team resume-stream 404, and fully lock React Flow into view-only status mode.

**Architecture:** Rework the Team page into a sidebar + main chat layout with a collapsible right-side status drawer. Fix the Team stream error at the source by disabling unsupported AI SDK stream resume in the Team controller, while keeping the existing status SSE stream and Team runtime wiring intact.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4, Vitest 4, `@assistant-ui/react`, `@ai-sdk/react`, `@xyflow/react`

---

### Task 1: Lock the Team resume-stream regression with tests

**Files:**

- Modify: `src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx`
- Modify: `src/renderer/src/features/team/team-page.test.tsx`

**Step 1: Write the failing test**

Add coverage for:

- Team `useChat` configuration disabling `resume`
- Team page rendering chat as the primary panel and a collapsed right status drawer trigger

Test sketch:

```tsx
expect(mockState.useChatMock).toHaveBeenCalledWith(
  expect.objectContaining({
    id: 'team-chat',
    resume: false
  })
)
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/team-page.test.tsx
```

Expected: FAIL because Team chat currently still uses a thread-specific chat id with `resume: true`, and the page still renders the status surface as the main panel.

**Step 3: Write minimal implementation**

- Remove Team resume-stream usage in the controller.
- Rebuild the Team page shell so chat is primary and status is drawer-driven.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/team-page.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/team-page.test.tsx src/renderer/src/features/team/pages/team-page.tsx src/renderer/src/features/team/hooks/use-team-page-controller.ts
git commit -m "fix: restore team chat as primary surface"
```

---

### Task 2: Make the right-side Team status drawer usable

**Files:**

- Modify: `src/renderer/src/features/team/pages/team-page.tsx`
- Modify: `src/renderer/src/features/team/components/team-status-graph.tsx`
- Modify: `src/renderer/src/features/team/team-page.test.tsx`

**Step 1: Write the failing test**

Add assertions for:

- a persistent status trigger button
- a collapsed drawer shell
- an open drawer container when toggled

Test sketch:

```tsx
expect(html).toContain('data-team-status-drawer="closed"')
expect(html).toContain('Open Team Status')
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/team/team-page.test.tsx
```

Expected: FAIL because the current Team page has no drawer shell.

**Step 3: Write minimal implementation**

- Add local drawer open state in `TeamPage`.
- Render the Team status graph inside a right-side drawer.
- Keep the drawer independently scrollable.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/team/team-page.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/team/pages/team-page.tsx src/renderer/src/features/team/team-page.test.tsx
git commit -m "feat: move team status into right drawer"
```

---

### Task 3: Lock React Flow into static inspection mode

**Files:**

- Modify: `src/renderer/src/features/team/components/team-status-graph.tsx`
- Modify: `src/renderer/src/features/team/components/team-status-graph.test.tsx`

**Step 1: Write the failing test**

Add coverage that the Team status graph passes a fully static React Flow prop set.

Test sketch:

```tsx
expect(flowProps.nodesDraggable).toBe(false)
expect(flowProps.selectionOnDrag).toBe(false)
expect(flowProps.nodesFocusable).toBe(false)
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/team/components/team-status-graph.test.tsx
```

Expected: FAIL because the graph does not yet assert the full static prop set.

**Step 3: Write minimal implementation**

- Add explicit static-mode React Flow props:
  - `selectionOnDrag={false}`
  - `selectNodesOnDrag={false}`
  - `nodesFocusable={false}`
  - `edgesFocusable={false}`
  - `panActivationKeyCode={null}`
- Keep visible status styling and animated delegation edges.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/team/components/team-status-graph.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/team/components/team-status-graph.tsx src/renderer/src/features/team/components/team-status-graph.test.tsx
git commit -m "fix: lock team status graph to view-only mode"
```

---

### Task 4: Verify the full Team renderer surface

**Files:**

- Verify only:
  - `src/renderer/src/features/team/team-page.test.tsx`
  - `src/renderer/src/features/team/components/team-chat-card.test.tsx`
  - `src/renderer/src/features/team/components/team-status-graph.test.tsx`
  - `src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx`
  - `src/renderer/src/features/team/team-queries.test.ts`

**Step 1: Run focused Team verification**

Run:

```bash
npm run test -- src/renderer/src/features/team/team-page.test.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx src/renderer/src/features/team/components/team-status-graph.test.tsx src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/team-queries.test.ts
```

Expected: PASS

**Step 2: Run broader renderer verification**

Run:

```bash
npm run test -- src/renderer/src
```

Expected: PASS

**Step 3: Run typecheck**

Run:

```bash
npm run typecheck:web
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/renderer/src/features/team src/renderer/src/main.tsx docs/plans/2026-03-08-team-chat-main-status-drawer-design.md docs/plans/2026-03-08-team-chat-main-status-drawer-implementation.md
git commit -m "feat: refocus team page on supervisor chat"
```
