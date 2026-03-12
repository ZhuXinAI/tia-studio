# Chat Sidebar Master Detail Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the chat sidebar into a master-detail assistant/thread navigator with searchable virtualized thread lists and an assistant switcher in detail mode.

**Architecture:** Keep the existing route-driven chat page and use `/chat` as the assistant master state while `/chat/:assistantId(/:threadId)` remains the assistant detail state. Refactor the sidebar component to render either the assistant directory or the selected assistant's thread list, and keep assistant switching inside the detail header with a lightweight dropdown. Use the existing `react-virtuoso` dependency for thread list virtualization and preserve current controller responsibilities for routing, thread CRUD, and assistant CRUD.

**Tech Stack:** Electron renderer (React 19 + TypeScript), React Router, TanStack Query, Tailwind CSS, `react-virtuoso`, Vitest, i18next.

---

## Execution rules

- Apply TDD where practical: add or adjust focused tests before or alongside behavior changes.
- Keep edits narrow to the chat feature surface; do not introduce new global navigation state if route state is enough.
- Prefer focused Vitest runs before broader typecheck/build commands.

---

### Task 1: Preserve `/chat` as a true assistant master route

**Files:**

- Modify: `src/renderer/src/features/threads/hooks/use-thread-page-controller.ts`
- Modify: `src/renderer/src/features/threads/thread-page-routing.ts` (only if new helpers are needed)
- Test: `src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`

**Step 1: Add/adjust failing controller coverage**

- Add a test that mounts the controller on `/chat` with assistants loaded and verifies it does not immediately navigate into an assistant route.
- Keep existing invalid-route fallback behavior covered if needed.

**Step 2: Run the focused controller test**

Run: `npm test -- src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`
Expected: FAIL until the redirect effect stops forcing `/chat` into assistant detail.

**Step 3: Implement the minimal routing fix**

- Change the assistant route resolution effect so it only redirects when a route assistant id exists and is invalid, instead of redirecting whenever `params.assistantId` is absent.
- Keep delete/create flows and stored thread selection behavior unchanged for assistant detail routes.

**Step 4: Re-run the focused controller test**

Run: `npm test -- src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/threads/hooks/use-thread-page-controller.ts src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx
git commit -m "feat: keep chat root as assistant directory"
```

---

### Task 2: Replace nested assistant/thread navigation with sidebar master-detail UI

**Files:**

- Modify: `src/renderer/src/features/threads/components/thread-sidebar.tsx`
- Test: `src/renderer/src/features/threads/components/thread-sidebar.test.tsx`

**Step 1: Add/adjust failing sidebar tests**

- Cover assistant master view rendering.
- Cover detail view rendering for a selected assistant.
- Cover thread search filtering in detail mode.
- Cover the assistant switcher dropdown opening and switching assistants.

**Step 2: Run the focused sidebar test file**

Run: `npm test -- src/renderer/src/features/threads/components/thread-sidebar.test.tsx`
Expected: FAIL until the sidebar structure matches the new UI.

**Step 3: Implement the sidebar refactor**

- Keep assistant actions in the master assistant directory.
- Add a detail header with back navigation, current assistant switcher trigger, and the existing new-thread action.
- Add thread search in detail mode and render the filtered threads through `Virtuoso`.
- Add the assistant switcher dropdown with its own search input and assistant list.
- Preserve thread delete confirmation behavior in detail mode.

**Step 4: Re-run the focused sidebar tests**

Run: `npm test -- src/renderer/src/features/threads/components/thread-sidebar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/threads/components/thread-sidebar.tsx src/renderer/src/features/threads/components/thread-sidebar.test.tsx
git commit -m "feat: add master detail chat sidebar"
```

---

### Task 3: Update copy, page wiring, and helper expectations

**Files:**

- Modify: `src/renderer/src/features/threads/pages/thread-page.tsx`
- Modify: `src/renderer/src/features/threads/thread-page.test.tsx`
- Modify: `src/renderer/src/features/threads/thread-list-state.test.ts`
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Run: `npm run i18n:sync`

**Step 1: Add/adjust any remaining failing tests**

- Update helper tests if the sidebar view model expectations changed.
- Add/adjust render assertions that rely on old nested assistant/thread UI copy.

**Step 2: Run the relevant focused tests**

Run: `npm test -- src/renderer/src/features/threads/thread-page.test.tsx src/renderer/src/features/threads/thread-list-state.test.ts`
Expected: FAIL if copy or assumptions still reflect the old layout.

**Step 3: Implement copy and wiring updates**

- Pass any new callbacks/props needed from the page/controller into `ThreadSidebar`.
- Add new English locale keys for detail search, assistant switcher labels, back navigation, and empty search states.
- Sync locale files.

**Step 4: Re-run the focused tests**

Run: `npm test -- src/renderer/src/features/threads/thread-page.test.tsx src/renderer/src/features/threads/thread-list-state.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/threads/pages/thread-page.tsx src/renderer/src/features/threads/thread-page.test.tsx src/renderer/src/features/threads/thread-list-state.test.ts src/renderer/src/i18n/locales/en-US.json src/renderer/src/i18n/locales/*.json
git commit -m "feat: polish chat sidebar copy and wiring"
```

---

### Task 4: Verify end-to-end renderer safety

**Files:**

- Run-only verification across modified chat files

**Step 1: Run focused chat tests**

Run: `npm test -- src/renderer/src/features/threads/components/thread-sidebar.test.tsx src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx src/renderer/src/features/threads/thread-page.test.tsx`
Expected: PASS

**Step 2: Run renderer typecheck**

Run: `npm run typecheck:web`
Expected: PASS

**Step 3: Review diff for regressions**

- Check assistant deletion flow, thread deletion confirm flow, and empty-state copy.
- Make sure virtualization is only used in detail mode and does not hide empty/loading states.

**Step 4: Commit**

```bash
git add -A
git commit -m "test: verify chat sidebar master detail flow"
```
