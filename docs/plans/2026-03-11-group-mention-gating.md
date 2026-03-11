# Group Mention Gating Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `groupRequireMention` channel flag that defaults to `true` and gates group-chat replies across Lark, Telegram, WhatsApp, and WeCom.

**Architecture:** Keep the flag in `app_channels.config`, thread it through channel create/update APIs and renderer forms, then enforce mention checks inside each channel adapter where group messages are normalized. Reuse channel-specific bot identity lookups where needed so mention checks target the current bot instead of any generic `@` reference.

**Tech Stack:** TypeScript, Electron main/renderer, Hono, Zod, Telegraf, Baileys, Lark SDK, WeCom SDK, Vitest.

---

### Task 1: Persist the new channel config flag

**Files:**
- Modify: `src/main/server/validators/claws-validator.ts`
- Modify: `src/main/server/routes/claws-route.ts`
- Modify: `src/renderer/src/features/claws/claws-query.ts`

**Step 1: Write the failing tests**
- Extend route tests to assert `groupRequireMention` is stored on channel create/update and returned in configured channel payloads.

**Step 2: Run the focused tests**
- Run: `pnpm vitest src/main/server/routes/claws-route.test.ts -t groupRequireMention`
- Expected: FAIL because schemas and config builders do not know the new field.

**Step 3: Write minimal implementation**
- Add `groupRequireMention?: boolean` to create/update schemas for all four channel types.
- Store `groupRequireMention ?? true` in `buildChannelConfig` and preserve/override it in `mergeChannelConfig`.
- Expose the flag from configured channel responses and shared renderer query types.

**Step 4: Run the focused tests again**
- Run: `pnpm vitest src/main/server/routes/claws-route.test.ts`
- Expected: PASS for updated route expectations.

### Task 2: Enforce group mention gating in channel adapters

**Files:**
- Modify: `src/main/channels/lark-channel.ts`
- Modify: `src/main/channels/telegram-channel.ts`
- Modify: `src/main/channels/whatsapp-channel.ts`
- Modify: `src/main/channels/wecom-channel.ts`
- Modify: `src/main/channels/channel-service.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing tests**
- Add adapter tests covering group messages with mentions, without mentions, and with `groupRequireMention: false`.

**Step 2: Run the focused tests**
- Run: `pnpm vitest src/main/channels/lark-channel.test.ts src/main/channels/telegram-channel.test.ts src/main/channels/whatsapp-channel.test.ts src/main/channels/wecom-channel.test.ts`
- Expected: FAIL because adapters ignore groups or do not check mentions.

**Step 3: Write minimal implementation**
- Lark: fetch bot info before websocket startup and use mention IDs for group messages.
- Telegram: fetch bot identity via `getMe()`, parse message entities, and only admit group/supergroup messages when the bot username is mentioned (unless the flag is false).
- WhatsApp: allow group JIDs, capture `mentionedJid`, compare against the connected bot JID, and gate group messages accordingly.
- WeCom: treat group chats like direct chats, checking for bot mention markup using configured bot identity when required.
- Pass `groupRequireMention` from channel config into each adapter, defaulting to `true` when absent.

**Step 4: Run the focused tests again**
- Run: `pnpm vitest src/main/channels/lark-channel.test.ts src/main/channels/telegram-channel.test.ts src/main/channels/whatsapp-channel.test.ts src/main/channels/wecom-channel.test.ts src/main/channels/channel-service.test.ts`
- Expected: PASS for group gating scenarios.

### Task 3: Surface the flag in the channel management UI

**Files:**
- Modify: `src/renderer/src/features/settings/pages/channels-settings-page.tsx`
- Modify: `src/renderer/src/features/claws/components/claw-channel-selector-dialog.tsx`
- Modify: `src/renderer/src/i18n/locales/en-US.json`
- Modify: `src/renderer/src/i18n/locales/ja-JP.json`
- Modify: `src/renderer/src/i18n/locales/ru-RU.json`
- Modify: `src/renderer/src/i18n/locales/zh-CN.json`

**Step 1: Write the failing tests**
- Extend settings/channel-selector tests to assert the switch defaults to enabled and that toggling it changes the submitted payload.

**Step 2: Run the focused tests**
- Run: `pnpm vitest src/renderer/src/features/settings/pages/channels-settings-page.test.tsx src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx`
- Expected: FAIL because the form state and copy do not include the new switch.

**Step 3: Write minimal implementation**
- Add a `groupRequireMention` switch to create/edit channel forms.
- Default new channels to `true`, preload existing channel values from API responses, and send the flag on create/update.
- Add localized label/help text describing that group chats only trigger on bot mentions when enabled.

**Step 4: Run the focused tests again**
- Run: `pnpm vitest src/renderer/src/features/settings/pages/channels-settings-page.test.tsx src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx`
- Expected: PASS for the updated form submissions.

### Task 4: Validate integrated flows

**Files:**
- Modify: `src/main/server/routes/claws-route.test.ts`
- Modify: `src/main/channels/channel-service.test.ts`
- Modify: `src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx`

**Step 1: Run broader validation**
- Run: `pnpm vitest src/main/server/routes/claws-route.test.ts src/main/channels/channel-service.test.ts src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx`
- Expected: PASS.

**Step 2: Run final targeted regression suite**
- Run: `pnpm vitest src/main/channels/*.test.ts src/renderer/src/features/settings/pages/channels-settings-page.test.tsx src/renderer/src/features/claws/components/claw-channel-selector-dialog.test.tsx`
- Expected: PASS.

**Step 3: Commit**
```bash
git add docs/plans/2026-03-11-group-mention-gating.md src/main/server/validators/claws-validator.ts src/main/server/routes/claws-route.ts src/main/channels/lark-channel.ts src/main/channels/telegram-channel.ts src/main/channels/whatsapp-channel.ts src/main/channels/wecom-channel.ts src/main/channels/channel-service.ts src/main/index.ts src/renderer/src/features/claws/claws-query.ts src/renderer/src/features/settings/pages/channels-settings-page.tsx src/renderer/src/features/claws/components/claw-channel-selector-dialog.tsx src/renderer/src/i18n/locales/en-US.json src/renderer/src/i18n/locales/ja-JP.json src/renderer/src/i18n/locales/ru-RU.json src/renderer/src/i18n/locales/zh-CN.json

git commit -m "feat: gate group replies on bot mentions"
```
