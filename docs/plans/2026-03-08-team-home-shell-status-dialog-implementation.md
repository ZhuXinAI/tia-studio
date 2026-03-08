# Team Home-Shell Status Dialog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Team page match the Home shell, move the status trigger into the composer, and open a graph-only Team status dialog.

**Architecture:** Reuse the Home page container pattern by pairing `TeamSidebar` with `SidebarInset`, keep `TeamChatCard` as the main panel, and manage a modal Team status dialog from `TeamPage`. Extend `TeamStatusGraph` with a graph-only mode so the dialog can omit the event log without forking the visualization.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4, Radix Dialog, Vitest 4, `@xyflow/react`

---

### Task 1: Lock the Home-style Team shell in tests

**Files:**
- Modify: `src/renderer/src/features/team/team-page.test.tsx`
- Modify: `src/renderer/src/features/team/components/team-chat-card.test.tsx`

**Step 1: Write the failing test**

Add assertions for:

- Home shell classes on the Team page
- `SidebarInset` usage
- composer-level `Open Team Status` button
- removal of the in-page status drawer marker

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/team/team-page.test.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx
```

Expected: FAIL because the Team page still uses the custom drawer layout and the composer has no status button.

**Step 3: Write minimal implementation**

- Switch `TeamPage` to the Home shell structure.
- Pass an `onOpenStatusDialog` callback into `TeamChatCard`.
- Add the ghost composer button.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/team/team-page.test.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx
```

Expected: PASS

---

### Task 2: Render Team status as a graph-only dialog

**Files:**
- Modify: `src/renderer/src/features/team/pages/team-page.tsx`
- Modify: `src/renderer/src/features/team/components/team-status-graph.tsx`
- Modify: `src/renderer/src/features/team/components/team-status-graph.test.tsx`

**Step 1: Write the failing test**

Add coverage for graph-only mode without the event log.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/team/components/team-status-graph.test.tsx
```

Expected: FAIL because `TeamStatusGraph` always renders the event log.

**Step 3: Write minimal implementation**

- Add a `showEventLog` prop to `TeamStatusGraph`.
- Render the graph-only variant inside a modal dialog in `TeamPage`.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/team/components/team-status-graph.test.tsx
```

Expected: PASS

---

### Task 3: Verify Team and renderer behavior

**Step 1: Run Team-focused verification**

```bash
npm run test -- src/renderer/src/features/team/team-page.test.tsx src/renderer/src/features/team/components/team-chat-card.test.tsx src/renderer/src/features/team/components/team-status-graph.test.tsx src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx src/renderer/src/features/team/team-queries.test.ts
```

**Step 2: Run typecheck**

```bash
npm run typecheck:web
```

**Step 3: Run renderer verification**

```bash
npm run test -- src/renderer/src
```
