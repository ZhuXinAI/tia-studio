# WhatsApp Channel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a WhatsApp channel powered by `@whiskeysockets/baileys`, surface QR login state in the frontend, and reuse the existing claw pairing approval flow after the WhatsApp device is authenticated.

**Architecture:** Keep the transport-specific logic inside a new `WhatsAppChannel` adapter that plugs into the existing channel bus and pairing repository. Persist Baileys auth files under the app user-data directory, publish lightweight connection/QR state through a dedicated runtime store, expose that state through the claws API, and extend the existing claws pairing dialog so it can show WhatsApp login QR state plus pairing requests in one place.

**Tech Stack:** Electron 39, Hono, React 19, React Router 7, TypeScript 5, Vitest 4, SQLite/libsql, `@whiskeysockets/baileys`, `qrcode`

---

## Execution rules

- Apply TDD where existing test seams already exist; add focused tests instead of broad snapshots.
- Keep v1 WhatsApp support private-chat-only and text-only, matching the current Telegram scope.
- Reuse the existing pairing repository and claw workflows instead of inventing a second approval model.
- Treat QR state as ephemeral runtime state; do not store QR payloads in SQLite.
- Prefer minimal UI changes that extend existing dialogs and settings screens.

---

### Task 1: Add WhatsApp runtime primitives

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/main/channels/types.ts`
- Create: `src/main/channels/whatsapp-auth-state-store.ts`
- Create: `src/main/channels/whatsapp-auth-state-store.test.ts`

**Step 1: Write the failing test**

Add store coverage for:

- saving QR/pairing state by channel id
- marking a channel connected/disconnected
- clearing stale QR payloads when connected or cleared

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/channels/whatsapp-auth-state-store.test.ts`
Expected: FAIL because the store does not exist yet.

**Step 3: Write minimal implementation**

- Add `@whiskeysockets/baileys` and `qrcode`.
- Extend `ChannelType` to include `'whatsapp'`.
- Create an in-memory runtime store that returns serializable state like:

```ts
type WhatsAppChannelAuthState = {
  channelId: string
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error'
  qrCodeDataUrl: string | null
  qrCodeValue: string | null
  phoneNumber: string | null
  errorMessage: string | null
  updatedAt: string
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/channels/whatsapp-auth-state-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/main/channels/types.ts src/main/channels/whatsapp-auth-state-store.ts src/main/channels/whatsapp-auth-state-store.test.ts
git commit -m "feat: add whatsapp auth runtime state"
```

---

### Task 2: Implement the Baileys adapter

**Files:**

- Create: `src/main/channels/whatsapp-channel.ts`
- Create: `src/main/channels/whatsapp-channel.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/channels/channel-service.test.ts`

**Step 1: Write the failing tests**

Add adapter coverage for:

- starting the socket and tracking connection state
- publishing QR payload updates
- ignoring group / non-text messages
- creating or refreshing pending pairings for unknown private chats
- forwarding approved private text messages as normalized `ChannelMessage`
- sending assistant replies back with `sendMessage`

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/channels/whatsapp-channel.test.ts src/main/channels/channel-service.test.ts`
Expected: FAIL because the adapter and registry wiring do not exist yet.

**Step 3: Write minimal implementation**

- Create a `WhatsAppChannel` that:
  - uses Baileys auth files stored under the Electron user-data path
  - listens to `connection.update` for QR and connection status
  - converts QR strings to a data URL with `qrcode`
  - emits approved text messages through `emitMessage`
  - reuses `ChannelPairingsRepository` exactly like Telegram after auth succeeds
- Register the adapter in `src/main/index.ts`.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/channels/whatsapp-channel.test.ts src/main/channels/channel-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/channels/whatsapp-channel.ts src/main/channels/whatsapp-channel.test.ts src/main/index.ts src/main/channels/channel-service.test.ts
git commit -m "feat: add whatsapp channel adapter"
```

---

### Task 3: Expose WhatsApp auth state through the claws API

**Files:**

- Modify: `src/main/server/validators/claws-validator.ts`
- Modify: `src/main/server/routes/claws-route.ts`
- Modify: `src/main/server/routes/claws-route.test.ts`

**Step 1: Write the failing tests**

Add route coverage for:

- creating and updating WhatsApp channel configs
- listing WhatsApp channels in claw/channel responses
- returning auth-state payloads for WhatsApp claws
- rejecting auth-state lookups for non-WhatsApp claws

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/server/routes/claws-route.test.ts`
Expected: FAIL because the schemas and route output do not support WhatsApp yet.

**Step 3: Write minimal implementation**

- Extend create/update schemas with WhatsApp channel payloads.
- Teach `buildChannelConfig`, `mergeChannelConfig`, and status helpers about WhatsApp.
- Add an endpoint like `GET /v1/claws/:assistantId/channel-auth` that returns the runtime auth state for WhatsApp claws.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/server/routes/claws-route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/server/validators/claws-validator.ts src/main/server/routes/claws-route.ts src/main/server/routes/claws-route.test.ts
git commit -m "feat: expose whatsapp auth state in claws api"
```

---

### Task 4: Extend claw management UI for WhatsApp

**Files:**

- Modify: `src/renderer/src/features/claws/claws-query.ts`
- Modify: `src/renderer/src/features/claws/components/claw-channel-selector-dialog.tsx`
- Modify: `src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx`
- Modify: `src/renderer/src/features/claws/components/claw-pairings-dialog.tsx`
- Create: `src/renderer/src/features/claws/components/claw-pairings-dialog.test.tsx`
- Modify: `src/renderer/src/features/claws/pages/claws-page.tsx`
- Modify: `src/renderer/src/features/claws/pages/claws-page.test.tsx`

**Step 1: Write the failing tests**

Add renderer coverage for:

- creating/selecting WhatsApp channels
- opening the pairings dialog immediately after saving a WhatsApp claw
- showing QR login state when WhatsApp is not authenticated
- continuing to show pairing approvals after auth

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx src/renderer/src/features/claws/components/claw-pairings-dialog.test.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx`
Expected: FAIL because the UI only knows about Telegram/Lark.

**Step 3: Write minimal implementation**

- Extend query types with WhatsApp channel config and auth-state fetchers.
- Add WhatsApp as a selectable channel type.
- Reuse the pairings dialog for both Telegram and WhatsApp, with a WhatsApp QR/status panel above the pairing list.
- Poll auth state while the WhatsApp dialog is open and stop polling once connected.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx src/renderer/src/features/claws/components/claw-pairings-dialog.test.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/claws/claws-query.ts src/renderer/src/features/claws/components/claw-channel-selector-dialog.tsx src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx src/renderer/src/features/claws/components/claw-pairings-dialog.tsx src/renderer/src/features/claws/components/claw-pairings-dialog.test.tsx src/renderer/src/features/claws/pages/claws-page.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx
git commit -m "feat: add whatsapp claw setup and qr dialog"
```

---

### Task 5: Update settings and copy

**Files:**

- Modify: `src/renderer/src/features/settings/pages/channels-settings-page.tsx`
- Modify: `src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
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

Add or update settings-page tests so WhatsApp channels can be created and edited there as well.

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
Expected: FAIL because settings only support Telegram/Lark right now.

**Step 3: Write minimal implementation**

- Extend the shared copy and selectors to mention WhatsApp.
- Update the settings page form to handle WhatsApp credentials.
- Run `pnpm i18n:sync` after editing `en-US`.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/settings/pages/channels-settings-page.tsx src/renderer/src/features/settings/pages/channels-settings-page.test.tsx src/renderer/src/i18n/locales/*.json
git commit -m "feat: add whatsapp channel copy and settings support"
```

---

### Task 6: Verify end-to-end behavior

**Files:**

- Modify as needed: touched files above

**Step 1: Run focused automated checks**

Run:

```bash
pnpm test -- src/main/channels/whatsapp-auth-state-store.test.ts src/main/channels/whatsapp-channel.test.ts src/main/channels/channel-service.test.ts src/main/server/routes/claws-route.test.ts src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx src/renderer/src/features/claws/components/claw-pairings-dialog.test.tsx src/renderer/src/features/claws/pages/claws-page.test.tsx src/renderer/src/features/settings/pages/channels-settings-page.test.tsx
```

Expected: PASS

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Smoke the packaged flow manually**

Run: `pnpm dev`
Verify:

- create a WhatsApp channel
- open the pairing dialog and see a QR
- scan the QR with WhatsApp
- send a DM and confirm it creates a pending pairing
- approve the pairing in TIA Studio
- send a second DM and confirm it routes into the assistant thread

**Step 4: Commit**

```bash
git add .
git commit -m "feat: verify whatsapp claw flow"
```
