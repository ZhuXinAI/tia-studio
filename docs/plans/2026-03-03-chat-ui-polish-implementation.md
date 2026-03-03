# Chat UI Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the dark theme background more neutral/near-black, add a confirmation tooltip for thread deletion, add dictation (speech-to-text) in the composer, and add a message overflow action menu using assistant-ui primitives.

**Architecture:** Keep existing `useChat` + thread routing/controller logic. Lift assistant-ui runtime creation to `ThreadChatCard` so both the message list and composer share a single `AssistantRuntimeProvider`. Use assistant-ui composer primitives (Input + dictation controls) while syncing back to the existing controller draft state. Add ActionBarMore UI inside the assistant message bubble.

**Tech Stack:** Electron renderer (React + TypeScript), Tailwind CSS, assistant-ui (`@assistant-ui/react`, `@assistant-ui/react-ai-sdk`), Vercel AI SDK (`@ai-sdk/react`), Vitest.

---

## Execution rules

- Apply **TDD** per task (red -> green -> refactor).
- Keep commits small and frequent (one commit per task).
- Prefer focused test runs (`pnpm vitest run <file>`) before running the full suite.

---

### Task 1: Dark theme background uses Tailwind `neutral-800`

**Files:**
- Modify: `src/renderer/src/assets/main.css`
- Create: `src/renderer/src/assets/main.css.test.ts`

**Step 1: Write the failing test**

Create `src/renderer/src/assets/main.css.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

describe('theme tokens', () => {
  it('uses neutral-800 as the dark background', () => {
    const css = fs.readFileSync(new URL('./main.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\\.dark\\s*\\{[\\s\\S]*--background:\\s*#262626\\s*;[\\s\\S]*\\}/)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/src/assets/main.css.test.ts`  
Expected: FAIL (dark background is not `#262626` yet).

**Step 3: Write minimal implementation**

In `src/renderer/src/assets/main.css`, update the `.dark` background token:

```css
.dark {
  --background: #262626;
  /* keep the rest unchanged */
}
```

**Step 4: Re-run test to verify it passes**

Run: `pnpm vitest run src/renderer/src/assets/main.css.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/assets/main.css src/renderer/src/assets/main.css.test.ts
git commit -m "feat: dark theme background uses neutral-800"
```

---

### Task 2: Thread delete requires inline confirmation

**Files:**
- Modify: `src/renderer/src/features/threads/components/thread-sidebar.tsx`
- Create: `src/renderer/src/features/threads/components/thread-delete-confirm.test.tsx` (small focused test)

**Step 1: Write the failing test**

Create `src/renderer/src/features/threads/components/thread-delete-confirm.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadSidebar } from './thread-sidebar'

describe('ThreadSidebar delete confirmation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('does not delete until confirmed', () => {
    const onDeleteThread = vi.fn()

    act(() => {
      root.render(
        <ThreadSidebar
          branches={[
            {
              assistantId: 'assistant-1',
              assistantName: 'Planner',
              canDeleteAssistant: true,
              isSelected: true,
              threads: [
                {
                  id: 'thread-1',
                  assistantId: 'assistant-1',
                  resourceId: 'default-profile',
                  title: 'Hello',
                  lastMessageAt: null,
                  createdAt: '2026-03-01T00:00:00.000Z',
                  updatedAt: '2026-03-01T00:00:00.000Z'
                }
              ]
            }
          ]}
          selectedThreadId={null}
          deletingThreadId={null}
          deletingAssistantId={null}
          isLoadingData={false}
          assistantsCount={1}
          isLoadingThreads={false}
          isCreatingThread={false}
          canCreateThread={false}
          onCreateThread={() => undefined}
          onCreateAssistant={() => undefined}
          onSelectAssistant={() => undefined}
          onSelectThread={() => undefined}
          onEditAssistant={() => undefined}
          onDeleteAssistant={() => undefined}
          onDeleteThread={onDeleteThread}
        />
      )
    })

    const deleteButton = container.querySelector(
      '[aria-label="Delete thread Hello"]'
    ) as HTMLButtonElement | null
    expect(deleteButton).not.toBeNull()

    act(() => {
      deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onDeleteThread).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Delete thread?')

    const confirm = container.querySelector(
      '[aria-label="Confirm delete thread"]'
    ) as HTMLButtonElement | null
    expect(confirm).not.toBeNull()

    act(() => {
      confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onDeleteThread).toHaveBeenCalledTimes(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-delete-confirm.test.tsx`  
Expected: FAIL (deletes immediately, no confirm UI).

**Step 3: Write minimal implementation**

In `src/renderer/src/features/threads/components/thread-sidebar.tsx`:

- Add local state to track the thread being confirmed (`confirmDeleteThreadId`).
- Change the trash button click to toggle the confirm bubble instead of calling `onDeleteThread`.
- Render a small absolute-positioned bubble with:
  - text: `Delete thread?`
  - buttons:
    - Cancel (`aria-label="Cancel delete thread"`)
    - Delete (`aria-label="Confirm delete thread"`) → calls `onDeleteThread(thread)`
- Add outside-click + `Escape` handlers when the bubble is open.

Implementation sketch:

```tsx
const [confirmDeleteThreadId, setConfirmDeleteThreadId] = useState<string | null>(null)
const confirmDeleteRef = useRef<HTMLDivElement | null>(null)

useEffect(() => {
  if (!confirmDeleteThreadId) return

  const handlePointerDown = (event: MouseEvent) => {
    if (!confirmDeleteRef.current || !(event.target instanceof Node)) return
    if (!confirmDeleteRef.current.contains(event.target)) {
      setConfirmDeleteThreadId(null)
    }
  }

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setConfirmDeleteThreadId(null)
  }

  window.addEventListener('mousedown', handlePointerDown)
  window.addEventListener('keydown', handleEscape)
  return () => {
    window.removeEventListener('mousedown', handlePointerDown)
    window.removeEventListener('keydown', handleEscape)
  }
}, [confirmDeleteThreadId])
```

Then wrap the delete button in a `relative` container and render the confirm bubble when active.

**Step 4: Re-run test to verify it passes**

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-delete-confirm.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/threads/components/thread-sidebar.tsx src/renderer/src/features/threads/components/thread-delete-confirm.test.tsx
git commit -m "feat: confirm before deleting thread"
```

---

### Task 3: Lift assistant-ui runtime to `ThreadChatCard` (shared provider)

**Files:**
- Modify: `src/renderer/src/features/threads/components/thread-chat-card.tsx`
- Modify: `src/renderer/src/features/threads/components/thread-chat-message-list.tsx`
- Modify: `src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx`
- Modify: `src/renderer/src/features/threads/components/thread-chat-card.test.tsx`

**Step 1: Write the failing test**

Update `src/renderer/src/features/threads/components/thread-chat-card.test.tsx` to mock runtime creation and assert it’s called with the `chat` helpers:

```ts
import { vi } from 'vitest'

const useAISDKRuntimeMock = vi.fn(() => ({ id: 'runtime' }))

vi.mock('@assistant-ui/react-ai-sdk', () => ({
  useAISDKRuntime: (chat: unknown) => useAISDKRuntimeMock(chat)
}))

vi.mock('@assistant-ui/react', () => ({
  AssistantRuntimeProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}))
```

Then add an assertion in the first test (after `renderToString(...)`):

```ts
expect(useAISDKRuntimeMock).toHaveBeenCalledTimes(1)
expect(useAISDKRuntimeMock).toHaveBeenCalledWith(expect.any(Object))
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-chat-card.test.tsx`  
Expected: FAIL (`useAISDKRuntime` not called yet).

**Step 3: Write minimal implementation**

In `src/renderer/src/features/threads/components/thread-chat-card.tsx`:

- Import and call `useAISDKRuntime(chat)` in the component.
- Wrap the message list + composer UI with:

```tsx
<AssistantRuntimeProvider runtime={runtime}>
  {/* existing content */}
</AssistantRuntimeProvider>
```

In `src/renderer/src/features/threads/components/thread-chat-message-list.tsx`:

- Remove `useAISDKRuntime` and `AssistantRuntimeProvider` usage.
- Remove the `chat` prop from `ThreadChatMessageListProps`.
- Keep only primitives rendering (`ThreadPrimitive.*`, `MessagePrimitive.*`, etc).

Update call site in `ThreadChatCard` to remove the `chat={chat}` prop.

**Step 4: Update message list tests**

In `src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx`:

- Remove the `@assistant-ui/react-ai-sdk` mock and the test that asserts `useAISDKRuntime` is called.
- Keep (or adjust) the scrollbar / stability assertions.

Then run:

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx`  
Expected: PASS

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-chat-card.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/threads/components/thread-chat-card.tsx src/renderer/src/features/threads/components/thread-chat-message-list.tsx src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx src/renderer/src/features/threads/components/thread-chat-card.test.tsx
git commit -m "refactor: share assistant-ui runtime across chat card"
```

---

### Task 4: Add dictation adapter + composer primitives in `ThreadChatCard`

**Files:**
- Modify: `src/renderer/src/features/threads/components/thread-chat-card.tsx`
- Modify: `src/renderer/src/features/threads/components/thread-chat-card.test.tsx`

**Step 1: Write the failing test**

Extend `src/renderer/src/features/threads/components/thread-chat-card.test.tsx` mock to make dictation “supported”, then assert `useAISDKRuntime` receives a dictation adapter:

```ts
class WebSpeechDictationAdapterMock {
  static isSupported() {
    return true
  }
}

vi.mock('@assistant-ui/react', async () => {
  const actual = (await vi.importActual('@assistant-ui/react')) as Record<string, unknown>
  return {
    ...actual,
    AssistantRuntimeProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    WebSpeechDictationAdapter: WebSpeechDictationAdapterMock
  }
})
```

Then update the assertion to:

```ts
expect(useAISDKRuntimeMock.mock.calls[0]?.[1]).toEqual(
  expect.objectContaining({
    adapters: expect.objectContaining({
      dictation: expect.any(Object)
    })
  })
)
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-chat-card.test.tsx`  
Expected: FAIL (no dictation adapter passed yet).

**Step 3: Write minimal implementation**

In `src/renderer/src/features/threads/components/thread-chat-card.tsx`:

- Import:

```ts
import { AssistantRuntimeProvider, ComposerPrimitive, WebSpeechDictationAdapter, useAui, useAuiState } from '@assistant-ui/react'
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import { useEffect, useMemo, useRef } from 'react'
```

- Create a memoized dictation adapter:

```ts
const dictationAdapter = useMemo(() => {
  if (typeof window === 'undefined') return null
  if (!WebSpeechDictationAdapter.isSupported()) return null
  return new WebSpeechDictationAdapter({ language: window.navigator.language })
}, [])
```

- Pass it to runtime creation:

```ts
const runtime = useAISDKRuntime(chat, {
  adapters: dictationAdapter ? { dictation: dictationAdapter } : undefined
})
```

- Replace `<Textarea />` with:
  - `ComposerPrimitive.Root` (use `onSubmit` and `event.preventDefault()` to call the existing `onSubmitMessage`)
  - `ComposerPrimitive.Input` (styled similarly to the old textarea)
  - Dictation controls using `ComposerPrimitive.Dictate` / `ComposerPrimitive.StopDictation` (use `asChild` to wrap the existing button styling)
  - Transcript preview via `ComposerPrimitive.DictationTranscript`

- Add a two-way sync guard (using “last synced value”) so dictation updates feed into `onComposerChange` without being overwritten:

```ts
const aui = useAui()
const composerText = useAuiState((s) => (s.composer.isEditing ? s.composer.text : ''))
const lastSyncedRef = useRef(composerValue)

useEffect(() => {
  if (composerText === composerValue) {
    lastSyncedRef.current = composerText
    return
  }

  const last = lastSyncedRef.current

  if (composerValue === last && composerText !== last) {
    onComposerChange(composerText)
    lastSyncedRef.current = composerText
    return
  }

  if (composerText === last && composerValue !== last) {
    aui.composer().setText(composerValue)
    lastSyncedRef.current = composerValue
    return
  }

  // fallback: prefer store text
  onComposerChange(composerText)
  lastSyncedRef.current = composerText
}, [aui, composerText, composerValue, onComposerChange])
```

**Step 4: Re-run tests**

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-chat-card.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/threads/components/thread-chat-card.tsx src/renderer/src/features/threads/components/thread-chat-card.test.tsx
git commit -m "feat: dictation-enabled composer primitives"
```

---

### Task 5: Add `ActionBarMorePrimitive` overflow menu to assistant messages

**Files:**
- Modify: `src/renderer/src/features/threads/components/thread-chat-message-list.tsx`
- Modify: `src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx`

**Step 1: Write the failing test**

In `src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx`, adjust the `ThreadPrimitive.Messages` mock to render the provided `AssistantMessage` component so we can assert it contains the overflow trigger:

```tsx
ThreadPrimitive: {
  Root,
  Viewport,
  Empty,
  Messages: ({ components }: { components: { AssistantMessage?: React.FC } }) => {
    const AssistantMessage = components.AssistantMessage
    return <div data-testid="assistant-message">{AssistantMessage ? <AssistantMessage /> : null}</div>
  }
}
```

Then add a test:

```tsx
it('renders overflow actions trigger for assistant messages', async () => {
  await act(async () => {
    root.render(
      <ThreadChatMessageList
        assistantName="Planner"
        isLoadingChatHistory={false}
        isChatStreaming={false}
        loadError={null}
        chatError={null}
      />
    )
  })

  expect(container.textContent).toContain('More')
})
```

(Prefer an `aria-label` assertion if the UI uses one, e.g. `aria-label="Message actions"`.)

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx`  
Expected: FAIL (overflow trigger not present).

**Step 3: Write minimal implementation**

In `src/renderer/src/features/threads/components/thread-chat-message-list.tsx`:

- Import:

```ts
import { ActionBarPrimitive, ActionBarMorePrimitive } from '@assistant-ui/react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '../../../components/ui/button'
```

- Inside `AssistantMessageBubble`, after `<MessagePrimitive.Parts />`, add:

```tsx
<ActionBarPrimitive.Root autohide="always" className="mt-2 flex justify-end">
  <ActionBarMorePrimitive.Root>
    <ActionBarMorePrimitive.Trigger asChild>
      <Button type="button" variant="ghost" size="icon" aria-label="Message actions">
        <MoreHorizontal className="size-4" />
      </Button>
    </ActionBarMorePrimitive.Trigger>

    <ActionBarMorePrimitive.Content className="bg-card text-card-foreground border-border z-50 min-w-40 rounded-md border p-1 shadow-lg">
      <ActionBarPrimitive.Copy asChild>
        <ActionBarMorePrimitive.Item className="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:opacity-50">
          Copy
        </ActionBarMorePrimitive.Item>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <ActionBarMorePrimitive.Item className="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:opacity-50">
          Reload
        </ActionBarMorePrimitive.Item>
      </ActionBarPrimitive.Reload>
      <ActionBarPrimitive.ExportMarkdown asChild>
        <ActionBarMorePrimitive.Item className="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:opacity-50">
          Export Markdown
        </ActionBarMorePrimitive.Item>
      </ActionBarPrimitive.ExportMarkdown>
    </ActionBarMorePrimitive.Content>
  </ActionBarMorePrimitive.Root>
</ActionBarPrimitive.Root>
```

**Step 4: Re-run test**

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/threads/components/thread-chat-message-list.tsx src/renderer/src/features/threads/components/thread-chat-message-list.test.tsx
git commit -m "feat: assistant message overflow actions menu"
```

---

### Task 6: Final verification

**Step 1: Run renderer tests**

Run: `pnpm vitest run src/renderer/src/features/threads/components`  
Expected: PASS

**Step 2: Run full test suite**

Run: `pnpm test`  
Expected: PASS

**Step 3: Run typecheck**

Run: `pnpm typecheck`  
Expected: Exit 0

