# Claw Channel Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the claw editor’s action-based channel setup with a selector dialog that lists all configured channels, supports nested add/remove flows, and keeps claws disabled until a channel is configured.

**Architecture:** Move channel lifecycle management out of the claw editor and into dedicated configured-channel APIs plus a reusable selector dialog. The renderer will choose a configured channel and translate that choice into existing claw save semantics (`attach`, `detach`, `keep`, or no channel), while the server enforces the invariant that channel-less claws cannot remain enabled.

**Tech Stack:** Electron, React, TypeScript, TanStack Query, Hono, Zod, Vitest, JSON locale catalogs.

---

### Task 1: Expand channel persistence and claws APIs

**Files:**

- Modify: `src/main/persistence/repos/channels-repo.ts`
- Modify: `src/main/persistence/repos/channels-repo.test.ts`
- Modify: `src/main/server/validators/claws-validator.ts`
- Modify: `src/main/server/routes/claws-route.ts`
- Modify: `src/main/server/routes/claws-route.test.ts`

**Step 1: Write the failing tests**

Add route and repo coverage for:

- returning `configuredChannels` from `GET /v1/claws`
- including `assistantId`, `assistantName`, `status`, `errorMessage`, `pairedCount`, and `pendingPairingCount`
- creating an unbound channel through `POST /v1/claws/channels`
- deleting an unbound channel through `DELETE /v1/claws/channels/:channelId`
- rejecting deletion of a bound channel with `409`
- coercing claw `enabled` to `false` when the final saved claw has no channel

Test sketch:

```ts
it('lists configured channels with binding metadata', async () => {
  const response = await app.request('http://localhost/v1/claws')
  const body = await response.json()

  expect(body.configuredChannels).toEqual([
    expect.objectContaining({
      id: expect.any(String),
      name: 'Bound Lark',
      assistantId: expect.any(String),
      assistantName: 'Ops Assistant',
      status: 'connected'
    }),
    expect.objectContaining({
      id: expect.any(String),
      name: 'Extra Telegram',
      assistantId: null
    })
  ])
})

it('rejects deleting a bound configured channel', async () => {
  const response = await app.request(`http://localhost/v1/claws/channels/${boundChannel.id}`, {
    method: 'DELETE'
  })

  expect(response.status).toBe(409)
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/main/persistence/repos/channels-repo.test.ts src/main/server/routes/claws-route.test.ts
```

Expected: FAIL because the repo does not support deletion, the list payload does not expose configured-channel metadata, and the new channel management endpoints do not exist yet.

**Step 3: Write minimal implementation**

- Add `delete(id)` to `ChannelsRepository`.
- In `GET /v1/claws`, replace `availableChannels` with `configuredChannels`.
- Build a response shape like:

```ts
type ConfiguredChannelResponse = {
  id: string
  type: string
  name: string
  assistantId: string | null
  assistantName: string | null
  status: 'connected' | 'disconnected' | 'error'
  errorMessage: string | null
  pairedCount: number
  pendingPairingCount: number
}
```

- Add:
  - `POST /v1/claws/channels`
  - `DELETE /v1/claws/channels/:channelId`
- Reuse Zod channel-create schemas so both Lark and Telegram creation stay validated in one place.
- Reject delete when `assistantId` is not `null`.
- Refactor create/update claw handlers so they compute the final channel presence and force `assistant.enabled = false` whenever the saved claw ends without a channel.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/main/persistence/repos/channels-repo.test.ts src/main/server/routes/claws-route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/persistence/repos/channels-repo.ts src/main/persistence/repos/channels-repo.test.ts src/main/server/validators/claws-validator.ts src/main/server/routes/claws-route.ts src/main/server/routes/claws-route.test.ts
git commit -m "feat: add configured channel management for claws"
```

---

### Task 2: Update the claws query layer for configured channels

**Files:**

- Modify: `src/renderer/src/features/claws/claws-query.ts`
- Modify: `src/renderer/src/features/claws/claws-query.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- `listClaws()` reading `configuredChannels`
- create-channel mutation posting to `/v1/claws/channels`
- delete-channel mutation calling `DELETE /v1/claws/channels/:channelId`

Test sketch:

```ts
it('lists configured channels for the selector dialog', async () => {
  mockFetchResponse({
    claws: [],
    configuredChannels: [
      {
        id: 'channel-1',
        type: 'telegram',
        name: 'Ops Bot',
        assistantId: null,
        assistantName: null,
        status: 'disconnected',
        errorMessage: null,
        pairedCount: 0,
        pendingPairingCount: 0
      }
    ]
  })

  await expect(listClaws()).resolves.toMatchObject({
    configuredChannels: [expect.objectContaining({ id: 'channel-1' })]
  })
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/features/claws/claws-query.test.ts
```

Expected: FAIL because the query layer still expects `availableChannels` and has no channel create/delete helpers.

**Step 3: Write minimal implementation**

- Replace `AvailableClawChannelRecord` with a richer `ConfiguredClawChannelRecord`.
- Update `ClawsResponse` to use `configuredChannels`.
- Add:

```ts
export type CreateClawChannelInput =
  | { type: 'lark'; name: string; appId: string; appSecret: string }
  | { type: 'telegram'; name: string; botToken: string }
```

- Add `createClawChannel(input)` and `deleteClawChannel(channelId)`.
- Keep `createClaw`, `updateClaw`, and pairing queries unchanged apart from the updated list shape.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/renderer/src/features/claws/claws-query.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/claws/claws-query.ts src/renderer/src/features/claws/claws-query.test.ts
git commit -m "refactor: expose configured claws channels to renderer"
```

---

### Task 3: Build the channel selector dialog with nested add/remove flows

**Files:**

- Create: `src/renderer/src/features/claws/components/claw-channel-selector-dialog.tsx`
- Create: `src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx`

**Step 1: Write the failing tests**

Cover:

- preselecting the current channel
- disabling channels bound to another assistant
- allowing `Clear Selection`
- opening a nested add dialog and validating required credentials
- opening a nested remove confirmation only for unbound channels

Test sketch:

```tsx
it('disables channels claimed by another assistant', async () => {
  renderSelector({
    currentAssistantId: 'assistant-1',
    selectedChannelId: 'channel-self',
    channels: [
      {
        id: 'channel-self',
        name: 'Current Telegram',
        type: 'telegram',
        assistantId: 'assistant-1',
        assistantName: 'Current claw',
        status: 'connected',
        errorMessage: null,
        pairedCount: 1,
        pendingPairingCount: 0
      },
      {
        id: 'channel-other',
        name: 'Claimed Lark',
        type: 'lark',
        assistantId: 'assistant-2',
        assistantName: 'Another claw',
        status: 'connected',
        errorMessage: null,
        pairedCount: 0,
        pendingPairingCount: 0
      }
    ]
  })

  expect(screen.getByLabelText('Claimed Lark')).toBeDisabled()
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx
```

Expected: FAIL because the selector component does not exist yet.

**Step 3: Write minimal implementation**

- Create a dialog component that accepts:

```ts
type ClawChannelSelectorDialogProps = {
  isOpen: boolean
  currentAssistantId: string | null
  selectedChannelId: string
  channels: ConfiguredClawChannelRecord[]
  isMutating: boolean
  errorMessage: string | null
  onClose: () => void
  onApply: (channelId: string) => void
  onClear: () => void
  onCreateChannel: (input: CreateClawChannelInput) => Promise<ConfiguredClawChannelRecord>
  onDeleteChannel: (channelId: string) => Promise<void>
}
```

- Render a single inventory list with row badges for:
  - available
  - in use by this claw
  - in use by another assistant
- Keep add and remove as nested dialogs inside this component.
- After successful create, append/select the new channel in local state and close the nested add dialog.
- Only enable remove for channels whose persisted `assistantId` is `null`.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/claws/components/claw-channel-selector-dialog.tsx src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx
git commit -m "feat: add claw channel selector dialog"
```

---

### Task 4: Refactor the claw editor to use channel selection instead of channel actions

**Files:**

- Modify: `src/renderer/src/features/claws/components/claw-editor-dialog.tsx`
- Modify: `src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx`

**Step 1: Write the failing tests**

Add coverage for:

- removing the `Channel Action` select from the rendered editor
- showing the current channel as the selected summary
- mapping save payloads correctly:
  - unchanged selection → `keep`
  - new selection → `attach`
  - cleared selection on existing claw → `detach`
  - no selection on new claw → omit `channel`

Test sketch:

```tsx
it('submits detach when an existing claw clears its channel', async () => {
  const onSubmit = vi.fn(async () => undefined)

  renderEditor({
    claw: {
      id: 'assistant-1',
      name: 'Ops Assistant',
      description: '',
      instructions: '',
      providerId: 'provider-1',
      enabled: true,
      channel: {
        id: 'channel-current',
        type: 'lark',
        name: 'Current Lark',
        status: 'connected',
        errorMessage: null
      }
    },
    configuredChannels: [
      {
        id: 'channel-current',
        type: 'lark',
        name: 'Current Lark',
        assistantId: 'assistant-1',
        assistantName: 'Ops Assistant',
        status: 'connected',
        errorMessage: null,
        pairedCount: 0,
        pendingPairingCount: 0
      }
    ],
    onSubmit
  })

  await user.click(screen.getByRole('button', { name: 'Select Channel' }))
  await user.click(screen.getByRole('button', { name: 'Clear Selection' }))
  await user.click(screen.getByRole('button', { name: 'Apply' }))
  await user.click(screen.getByRole('button', { name: 'Save Claw' }))

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      channel: { mode: 'detach' }
    })
  )
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx
```

Expected: FAIL because the editor still renders the action dropdown and inline credential fields.

**Step 3: Write minimal implementation**

- Remove `channelAction`, `channelType`, `existingChannelId`, and inline credential form state from the editor.
- Replace them with:
  - `selectedChannelId`
  - selected channel summary UI
  - selector open/close state
- Translate selection into the existing claw payload contract:

```ts
function buildChannelPayload(): SaveClawInput['channel'] {
  if (!selectedChannelId) {
    return claw?.channel ? { mode: 'detach' } : undefined
  }

  if (claw?.channel?.id === selectedChannelId) {
    return claw.channel ? { mode: 'keep' } : undefined
  }

  return { mode: 'attach', channelId: selectedChannelId }
}
```

- Keep the editor pure by receiving channel create/delete callbacks from the page instead of importing query hooks directly.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test -- src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/claws/components/claw-editor-dialog.tsx src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx src/renderer/src/features/claws/components/claw-channel-selector-dialog.tsx src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx
git commit -m "refactor: move claw channel setup into selector dialog"
```

---

### Task 5: Wire the claws page, warning states, and translations

**Files:**

- Modify: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Modify: `src/renderer/src/features/claws/pages/claws-page.test.tsx`
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `src/renderer/src/i18n/locales/zh-CN.json`
- Modify: `src/renderer/src/i18n/locales/zh-HK.json`
- Modify: `src/renderer/src/i18n/locales/de-DE.json`
- Modify: `src/renderer/src/i18n/locales/ja-JP.json`
- Modify: `src/renderer/src/i18n/locales/ru-RU.json`
- Modify: `src/renderer/src/i18n/locales/el-GR.json`
- Modify: `src/renderer/src/i18n/locales/es-ES.json`
- Modify: `src/renderer/src/i18n/locales/fr-FR.json`
- Modify: `src/renderer/src/i18n/locales/pt-PT.json`
- Modify: `src/renderer/src/i18n/locales/ro-RO.json`

**Step 1: Write the failing tests**

Add page coverage for:

- passing `configuredChannels` and channel-management callbacks into the editor
- showing warning copy when a claw has no channel
- disabling the enable button when a claw has no channel
- keeping Telegram pairings auto-open behavior when a newly created claw ends up attached to a Telegram channel

Test sketch:

```tsx
it('disables enable for claws without a configured channel', async () => {
  mockListClaws({
    claws: [
      {
        id: 'assistant-1',
        name: 'Ops Assistant',
        description: '',
        instructions: '',
        providerId: 'provider-1',
        enabled: false,
        channel: null
      }
    ],
    configuredChannels: []
  })

  renderPage()

  expect(screen.getByText('Configure a channel first')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enable' })).toBeDisabled()
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/renderer/src/features/claws/pages/claws-page.test.tsx
```

Expected: FAIL because the page still expects `availableChannels`, shows neutral no-channel copy, and always enables the toggle button.

**Step 3: Write minimal implementation**

- Add page-level helpers for `createClawChannel` and `deleteClawChannel`.
- Pass `configuredChannels`, `onCreateChannel`, and `onDeleteChannel` into the editor.
- Refresh the claws list after channel create/delete.
- In claw cards:
  - replace neutral no-channel copy with warning copy
  - disable the enable button when `claw.channel` is `null`
- After creating a new claw, continue opening pairings when `savedClaw.channel?.type === 'telegram'`.
- Add new English copy for:
  - channel selector title/description
  - in-use badges
  - add/remove/clear actions
  - add/remove errors
  - no-channel warning
- Run locale sync:

```bash
npm run i18n:sync
```

**Step 4: Run focused verification**

Run:

```bash
npm run test -- src/main/persistence/repos/channels-repo.test.ts src/main/server/routes/claws-route.test.ts src/renderer/src/features/claws/claws-query.test.ts src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx
npm run typecheck
```

Expected: PASS on both commands.

**Step 5: Commit**

```bash
git add src/renderer/src/features/claws/pages/claws-page.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/i18n/locales/en-US.json src/renderer/src/i18n/locales/zh-CN.json src/renderer/src/i18n/locales/zh-HK.json src/renderer/src/i18n/locales/de-DE.json src/renderer/src/i18n/locales/ja-JP.json src/renderer/src/i18n/locales/ru-RU.json src/renderer/src/i18n/locales/el-GR.json src/renderer/src/i18n/locales/es-ES.json src/renderer/src/i18n/locales/fr-FR.json src/renderer/src/i18n/locales/pt-PT.json src/renderer/src/i18n/locales/ro-RO.json
git commit -m "feat: add selector-based claw channel setup"
```

---

Before final handoff, run `superpowers:verification-before-completion`, then use `superpowers:requesting-code-review` on the finished branch.
