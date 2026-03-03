# Provider Badge In Thread Header Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the selected assistant’s provider + model in the thread header as a compact badge.

**Architecture:** Derive a `providerBadgeLabel` from `selectedAssistant.providerId` + the loaded `providers` list in `useThreadPageController`, pass it down through `ThreadPage` into `ThreadChatCard`, and render it as a small truncated pill in the header.

**Tech Stack:** React + TypeScript, Tailwind CSS, Vitest, React Router.

---

## Execution rules

- Apply **TDD** per task (red -> green -> refactor).
- Keep commits small and frequent (one commit per task).
- Prefer running focused tests (`pnpm vitest run <file>`) before running the full suite.

---

### Task 1: Render provider badge in `ThreadChatCard`

**Files:**
- Modify: `src/renderer/src/features/threads/components/thread-chat-card.tsx`
- Test: `src/renderer/src/features/threads/components/thread-chat-card.test.tsx`

**Step 1: Write the failing test**

Update the existing “keeps the header compact…” test to pass a provider label and assert it renders:

```ts
// inside the first test’s <ThreadChatCard ... />
providerBadgeLabel="OpenAI (gpt-5)"
```

Then add:

```ts
expect(html).toContain('OpenAI (gpt-5)')
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-chat-card.test.tsx`  
Expected: FAIL because the provider label is not rendered.

**Step 3: Write minimal implementation**

Add an optional prop and render a compact pill before the existing status chip:

```ts
type ThreadChatCardProps = {
  // ...
  providerBadgeLabel?: string | null
}

export function ThreadChatCard({ providerBadgeLabel, ...rest }: ThreadChatCardProps) {
  // ...
  return (
    <Card /* ... */>
      <CardHeader /* ... */>
        <div className="flex h-full flex-nowrap items-center justify-between gap-3 overflow-hidden">
          {/* title */}
          <div className="flex shrink-0 items-center gap-2">
            {providerBadgeLabel ? (
              <div
                className="bg-muted/50 text-muted-foreground inline-flex max-w-[14rem] items-center rounded-full px-2.5 py-1 text-xs"
                title={providerBadgeLabel}
              >
                <span className="min-w-0 truncate">{providerBadgeLabel}</span>
              </div>
            ) : null}
            {/* existing status chip + Configure button */}
          </div>
        </div>
      </CardHeader>
      {/* ... */}
    </Card>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-chat-card.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/threads/components/thread-chat-card.tsx src/renderer/src/features/threads/components/thread-chat-card.test.tsx
git commit -m "feat: show provider badge in thread header"
```

---

### Task 2: Derive `providerBadgeLabel` in controller and pass it to `ThreadChatCard`

**Files:**
- Modify: `src/renderer/src/features/threads/hooks/use-thread-page-controller.ts`
- Modify: `src/renderer/src/features/threads/pages/thread-page.tsx`
- Test: `src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`

**Step 1: Write the failing test**

Add a new test:

```tsx
it('derives provider badge label for the selected assistant', async () => {
  await act(async () => {
    root.render(
      <Harness
        onControllerChange={(value) => {
          controller = value
        }}
        onForceRerenderReady={(value) => {
          forceRerender = value
        }}
      />
    )
  })

  await waitForCondition(
    () => Boolean(controller && !controller.isLoadingData),
    'initial data load'
  )

  expect(controller?.providerBadgeLabel).toBe('OpenAI (gpt-5)')
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`  
Expected: FAIL (`providerBadgeLabel` is `undefined` / not derived).

**Step 3: Write minimal implementation**

In the controller, derive the selected provider and label:

```ts
const selectedProvider = useMemo(() => {
  const providerId = selectedAssistant?.providerId?.trim() ?? ''
  if (!providerId) {
    return null
  }
  return providers.find((provider) => provider.id === providerId) ?? null
}, [providers, selectedAssistant?.providerId])

const providerBadgeLabel = useMemo(() => {
  if (!selectedProvider) {
    return null
  }

  const name = selectedProvider.name.trim()
  const model = selectedProvider.selectedModel.trim()
  if (name.length === 0) {
    return null
  }

  return model.length > 0 ? `${name} (${model})` : name
}, [selectedProvider])
```

Return it from the hook:

```ts
return {
  // ...
  providerBadgeLabel,
  // ...
}
```

In `ThreadPage`, pass it down:

```tsx
<ThreadChatCard
  // ...
  providerBadgeLabel={controller.providerBadgeLabel}
  // ...
/>
```

**Step 4: Re-run tests**

Run: `pnpm vitest run src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx`  
Expected: PASS

Run: `pnpm vitest run src/renderer/src/features/threads/components/thread-chat-card.test.tsx`  
Expected: PASS

**Step 5: Run typecheck**

Run: `pnpm typecheck`  
Expected: Exit 0

**Step 6: Commit**

```bash
git add src/renderer/src/features/threads/hooks/use-thread-page-controller.ts src/renderer/src/features/threads/pages/thread-page.tsx src/renderer/src/features/threads/hooks/use-thread-page-controller.test.tsx
git commit -m "feat: wire provider badge label into thread header"
```

