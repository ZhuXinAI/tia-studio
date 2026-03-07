# Team Thread Routing And Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix team thread URLs so existing team threads open reliably and allow deleting team threads from the Team sidebar.

**Architecture:** Treat the routing bug as a renderer regression first: add route coverage for `/team/:workspaceId/:threadId`, then make the router explicit if needed so the URL always resolves to `TeamPage`. Reuse the existing team thread delete API and mirror the main chat sidebar’s confirmation pattern in the team sidebar and controller so deleting a selected thread updates navigation and local state cleanly.

**Tech Stack:** Electron, React 19, React Router, Vitest, Hono, TypeScript.

---

### Task 1: Lock down the failing team-thread URL behavior

**Files:**
- Modify: `src/renderer/src/app/router.test.tsx`

**Step 1: Write the failing test**

- Add coverage for rendering `/team/workspace-1/thread-1`.
- Assert the router keeps the full pathname and renders the team shell instead of the route error UI.

**Step 2: Run the focused test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/app/router.test.tsx
```

Expected: FAIL if team thread URLs still hit the route error path.

**Step 3: Write the minimal implementation**

- Update `src/renderer/src/app/router.tsx` to register explicit team routes for:
  - `/team`
  - `/team/:workspaceId`
  - `/team/:workspaceId/:threadId`

**Step 4: Re-run the focused test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/app/router.test.tsx
```

Expected: PASS

---

### Task 2: Expose team thread deletion in the sidebar and controller

**Files:**
- Modify: `src/renderer/src/features/team/components/team-sidebar.tsx`
- Modify: `src/renderer/src/features/team/components/team-sidebar.test.tsx`
- Modify: `src/renderer/src/features/team/hooks/use-team-page-controller.ts`
- Modify: `src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx`
- Modify: `src/renderer/src/features/team/pages/team-page.tsx`

**Step 1: Write the failing tests**

- Add a sidebar test that requires confirmation before deleting a team thread.
- Add a controller test that deletes the selected team thread, removes it from local state, and navigates back to the workspace route.

**Step 2: Run the focused tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/features/team/components/team-sidebar.test.tsx src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx
```

Expected: FAIL because the delete callback is not wired yet.

**Step 3: Write the minimal implementation**

- Reuse `deleteTeamThread` from `team-threads-query`.
- Track the pending delete thread id in the controller.
- Add a confirmation affordance in `TeamSidebar`.
- Pass `onDeleteThread` and `deletingThreadId` through `TeamPage`.
- When the selected thread is deleted, navigate back to `/team/:workspaceId`.

**Step 4: Re-run the focused tests to verify they pass**

Run:

```bash
npm run test -- src/renderer/src/features/team/components/team-sidebar.test.tsx src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx
```

Expected: PASS

---

### Task 3: Verify the end-to-end regression surface

**Files:**
- Modify: `src/renderer/src/app/router.tsx`

**Step 1: Run the focused renderer regression suite**

Run:

```bash
npm run test -- src/renderer/src/app/router.test.tsx src/renderer/src/features/team/components/team-sidebar.test.tsx src/renderer/src/features/team/hooks/use-team-page-controller.test.tsx
```

Expected: PASS

**Step 2: Run type-check if the touched files introduce typing changes**

Run:

```bash
npm run typecheck:web
```

Expected: PASS
