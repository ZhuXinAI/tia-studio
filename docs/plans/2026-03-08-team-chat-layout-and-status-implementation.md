# Team Chat Layout and Status Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Team chat scroll ownership, move Team chat into a bottom-right floating panel, and make Team status visibly work in React Flow.

**Architecture:** Rework the Team page into a fixed-height, overflow-contained shell with a status-first center column and a docked chat overlay. Keep the existing controller and event stream wiring, but make state changes visible through explicit React Flow node styling and isolated scroll regions.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4, Vitest 4, `@assistant-ui/react`, `@xyflow/react`

---

### Task 1: Lock Team shell scrolling to internal panels

**Files:**

- Modify: `src/renderer/src/features/team/team-page.test.tsx`
- Modify: `src/renderer/src/features/team/pages/team-page.tsx`
- Modify: `src/renderer/src/features/team/components/team-chat-card.test.tsx`
- Modify: `src/renderer/src/features/team/components/team-chat-card.tsx`

**Step 1: Write the failing test**

Add assertions that the Team page renders a fixed-height, overflow-hidden shell and that the Team chat card keeps an internal transcript container.

Test sketch:

```tsx
expect(html).toContain('h-[calc(100vh-3.5rem)]')
expect(html).toContain('overflow-hidden')
expect(html).toContain('data-team-chat-card="floating-shell"')
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/team/team-page.test.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx
```

Expected: FAIL because the Team page still uses a page-growing grid and the Team chat card has no floating shell marker.

**Step 3: Write minimal implementation**

- Change the Team page container to a fixed-height, overflow-contained shell.
- Keep the sidebar in the base layout.
- Add an explicit wrapper marker for the Team chat shell.
- Preserve current Team chat behavior while making the transcript area the internal scroller.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/team/team-page.test.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/team/team-page.test.tsx src/renderer/src/features/team/pages/team-page.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx src/renderer/src/features/team/components/team-chat-card.tsx
git commit -m "fix: contain team chat scrolling"
```

---

### Task 2: Dock Team chat as a bottom-right floating panel

**Files:**

- Modify: `src/renderer/src/features/team/pages/team-page.tsx`
- Modify: `src/renderer/src/features/team/components/team-chat-card.tsx`
- Modify: `src/renderer/src/features/team/team-page.test.tsx`

**Step 1: Write the failing test**

Add coverage that the Team page renders the chat card in a bottom-right overlay container rather than as the center grid column.

Test sketch:

```tsx
expect(html).toContain('pointer-events-none fixed bottom-4 right-4')
expect(html).toContain('Team Chat')
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/team/team-page.test.tsx
```

Expected: FAIL because the current layout still renders the chat card inline.

**Step 3: Write minimal implementation**

- Replace the three-column Team page with a sidebar + status layout.
- Render `TeamChatCard` in a fixed bottom-right overlay with pointer-event isolation.
- Keep the overlay width bounded so it does not dominate the page.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/team/team-page.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/team/pages/team-page.tsx src/renderer/src/features/team/components/team-chat-card.tsx src/renderer/src/features/team/team-page.test.tsx
git commit -m "feat: dock team chat as floating panel"
```

---

### Task 3: Make Team status visibly work in React Flow

**Files:**

- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/features/team/components/team-status-graph.tsx`
- Modify: `src/renderer/src/features/team/components/team-status-graph.test.tsx`

**Step 1: Write the failing test**

Add coverage that a running node receives visible running styles and that a failed run applies error styling to the supervisor.

Test sketch:

```tsx
expect(html).toContain('border-blue-500/60')
expect(html).toContain('Supervisor')
expect(html).toContain('border-red-500/60')
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/team/components/team-status-graph.test.tsx
```

Expected: FAIL because the current graph only emits `data-state` without state-specific classes.

**Step 3: Write minimal implementation**

- Import `@xyflow/react/dist/style.css` in `src/renderer/src/main.tsx`.
- Add explicit class mappings for `idle`, `running`, `done`, and `error`.
- Make the event log internally scrollable.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/team/components/team-status-graph.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/main.tsx src/renderer/src/features/team/components/team-status-graph.tsx src/renderer/src/features/team/components/team-status-graph.test.tsx
git commit -m "feat: show visible team run status in graph"
```

---

### Task 4: Verify the Team surface end-to-end

**Files:**

- Verify only:
  - `src/renderer/src/features/team/team-page.test.tsx`
  - `src/renderer/src/features/team/components/team-chat-card.test.tsx`
  - `src/renderer/src/features/team/components/team-status-graph.test.tsx`
  - `src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx`
  - `src/renderer/src/features/team/team-queries.test.ts`

**Step 1: Run focused verification**

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

Expected: PASS, or only pre-existing unrelated failures outside the Team surface.

**Step 3: Commit**

```bash
git add src/renderer/src/main.tsx src/renderer/src/features/team
git commit -m "feat: polish team layout and status visibility"
```
