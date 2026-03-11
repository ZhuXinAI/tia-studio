# WeCom Channel Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new `wecom` channel that uses the WeCom AI Bot Node SDK with `botId` and `secret`, and expose it anywhere users can create, edit, or run channels.

**Architecture:** Follow the existing channel pattern: add a dedicated `WeComChannel` adapter in `src/main/channels`, register it in the main process adapter factory map, then thread the new channel type and config shape through the Claws API validators and renderer forms. Reuse the existing connected/disconnected status model used by Lark for non-pairing channels.

**Tech Stack:** Electron, React, TypeScript, Vitest, Hono, pnpm, `@wecom/aibot-node-sdk`

---

### Task 1: Add the runtime adapter

**Files:**
- Create: `src/main/channels/wecom-channel.ts`
- Test: `src/main/channels/wecom-channel.test.ts`
- Modify: `src/main/channels/types.ts`
- Modify: `src/main/index.ts`
- Modify: `package.json`

**Step 1: Add the failing test**

Run: `pnpm vitest run src/main/channels/wecom-channel.test.ts`
Expected: FAIL because the adapter does not exist yet.

**Step 2: Implement the adapter**

- Wrap `@wecom/aibot-node-sdk` `WSClient`
- Start with `connect()` and stop with `disconnect()`
- Listen for `message.text` and map `msgid`, `chatid`, `from.userid`, `text.content`, and `create_time` to `ChannelMessage`
- Send outbound text with `sendMessage(chatid, { msgtype: 'markdown', markdown: { content } })`
- Surface SDK `error` events through the existing fatal-error callback pattern

**Step 3: Register the channel type**

- Extend `ChannelType` with `wecom`
- Add a `wecom` adapter factory in `src/main/index.ts`
- Read `botId` and `secret` from channel config and validate both are present
- Add `@wecom/aibot-node-sdk` to dependencies

**Step 4: Re-run focused tests**

Run: `pnpm vitest run src/main/channels/wecom-channel.test.ts src/main/channels/channel-service.test.ts`
Expected: PASS

### Task 2: Thread WeCom through the Claws API

**Files:**
- Modify: `src/main/server/validators/claws-validator.ts`
- Modify: `src/main/server/routes/claws-route.ts`
- Test: `src/main/server/routes/claws-route.test.ts`

**Step 1: Add the failing route tests**

Run: `pnpm vitest run src/main/server/routes/claws-route.test.ts`
Expected: FAIL after adding WeCom create/update expectations.

**Step 2: Extend schemas and config helpers**

- Add `wecom` create/update schemas using `botId` and `secret`
- Allow inline claw creation and configured-channel creation/editing for `wecom`
- Treat WeCom as a non-pairing channel with valid config when both `botId` and `secret` are present
- Build and merge channel config using `botId` and `secret`

**Step 3: Re-run focused tests**

Run: `pnpm vitest run src/main/server/routes/claws-route.test.ts`
Expected: PASS

### Task 3: Expose WeCom in the renderer flows

**Files:**
- Modify: `src/renderer/src/features/claws/claws-query.ts`
- Modify: `src/renderer/src/features/claws/claw-labels.ts`
- Modify: `src/renderer/src/features/claws/components/claw-channel-selector-dialog.tsx`
- Modify: `src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx`
- Modify: `src/renderer/src/features/settings/pages/channels-settings-page.tsx`
- Modify: `src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `src/renderer/src/i18n/locales/zh-CN.json`
- Modify: `src/renderer/src/i18n/locales/zh-HK.json`

**Step 1: Add the failing UI tests**

Run: `pnpm vitest run src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
Expected: FAIL after adding WeCom create/edit expectations.

**Step 2: Update the renderer data model and forms**

- Add `wecom` to the create/update channel unions
- Add WeCom to the type selectors in both dialogs/pages
- Capture `botId` and `secret` for WeCom, keeping Telegram and WhatsApp behavior unchanged
- Label the channel as `Wecom` in English and `企业微信` in Chinese
- Refresh user-facing copy that enumerates supported channel types where needed

**Step 3: Re-run focused renderer tests**

Run: `pnpm vitest run src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
Expected: PASS

### Task 4: Validate the integration end to end

**Files:**
- Modify: `docs/plans/2026-03-11-wecom-channel-support.md`

**Step 1: Run targeted verification**

Run: `pnpm vitest run src/main/channels/wecom-channel.test.ts src/main/channels/channel-service.test.ts src/main/server/routes/claws-route.test.ts src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx src/renderer/src/features/settings/pages/channels-settings-page.test.tsx`
Expected: PASS

**Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS
