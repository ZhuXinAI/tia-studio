# Channels in TIA Studio

Channels are how a TIA Studio assistant shows up in real conversations.

When you attach a channel to an assistant, that assistant can receive inbound messages from the outside world, route them into its runtime, and send replies back through the same transport. In practice, this is what turns an assistant into a local claw.

## What a channel does

A channel is responsible for a small, focused part of the system:

- Receive inbound messages from a supported platform
- Normalize those messages into TIA Studio's shared channel message shape
- Route each remote conversation into the correct assistant thread
- Deliver assistant replies back to the source platform
- Maintain channel-specific auth or connection state where needed

The assistant still owns identity, tools, memory, prompts, workspace, cron, and heartbeat behavior. The channel is the transport bridge.

## Current support

| Channel  | Direct Chat | Group Chat | Group Trigger                       | Notes                                                              |
| -------- | ----------- | ---------- | ----------------------------------- | ------------------------------------------------------------------ |
| Discord  | ✅          | ✅         | Requires bot `@` mention by default | Group mention gating can be configured per channel                 |
| Lark     | ✅          | ✅         | Requires bot `@` mention by default | Group mention gating can be configured per channel                 |
| Telegram | ✅          | 🚫         | Not available yet                   | Telegram is currently DM-only while group behavior is under review |
| WhatsApp | ✅          | ✅         | Requires bot `@` mention by default | Group mention gating can be configured per channel                 |
| Wecom    | ✅          | ✅         | Requires bot `@` mention by default | Group mention gating can be configured per channel                 |

## Group behavior

For channels that support groups, TIA Studio uses a `groupRequireMention` channel setting.

- Default: `true`
- Meaning: group messages only trigger the assistant when the bot is explicitly mentioned
- If disabled: every group message can trigger a reply on that channel

This is meant to keep group chats feeling close to DM behavior while avoiding accidental interruptions in busy shared rooms.

Telegram is the current exception: even if the setting exists in stored channel config, Telegram runtime behavior is intentionally limited to direct messages for now.

## Channel-specific notes

### Lark

- Supports direct chats and group chats
- Uses bot identity lookup to detect whether the current bot was actually mentioned in a group
- Group replies are mention-gated by default

### Discord

- Supports direct messages and guild text channels
- Uses the connected bot identity to detect explicit user mentions in guild channels
- Group replies are mention-gated by default

### Telegram

- Supports direct chats
- Group support is intentionally disabled for now
- Pairing and approval still apply for direct conversations

### WhatsApp

- Supports direct chats and group chats
- Tracks the connected bot JID and compares it against mentioned JIDs in group messages
- Group replies are mention-gated by default

### Wecom

- Supports direct chats and group chats
- Detects bot mentions from the text payload used by the current Wecom adapter
- Group replies are mention-gated by default

## Why channels matter

Channels let you keep one assistant identity while meeting users where they already are.

That means:

- the same assistant can work in the desktop app and in an external chat
- the same workspace and memory are reused across both
- channel conversations still map into assistant threads
- operational features like cron and heartbeat remain assistant-owned instead of becoming channel-owned

If you want the broader claw architecture story, check [CLAW.md](./CLAW.md).
