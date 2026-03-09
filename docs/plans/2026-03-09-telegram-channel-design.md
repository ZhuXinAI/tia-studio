# Channels / Telegram DM Pairing Design

## Context

TIA Studio already has a channel transport layer for Lark, a shared event bus, assistant-bound channel records, and remote-chat-to-thread bindings. Telegram needs to fit into those same seams instead of introducing a separate integration model.

Telegram bot tokens are intentionally broad: anyone who can message the bot can reach it unless the application adds its own allowlist. Because one Telegram bot token should support multiple end users, the app needs a pairing layer between Telegram inbound updates and assistant execution.

OpenClaw already uses a simple approval-based pairing model for Telegram. TIA Studio should stay close to that model for v1: unknown DMs create a pending request, the bot replies with a short code, and the owner approves the request from the desktop app before the sender can talk to the assistant.

## Goals

- add a `telegram` channel type that uses one bot token per channel
- support multiple separately paired Telegram DM users on the same bot token
- require approval before any Telegram sender can talk to the assistant
- keep Telegram conversations visible in normal local thread history
- reuse the existing `Claws` setup flow for Telegram channel creation and pairing management
- keep transport simple in v1: DM-only, text-only, long polling via `telegraf`

## Non-goals

- no Telegram group, supergroup, or channel support in v1
- no webhook deployment flow
- no media upload/download support in v1
- no manual code entry requirement inside TIA Studio
- no generic cross-channel pairing framework beyond what Telegram needs today

## Product Decisions

### 1. One Telegram bot token can serve many paired users

- one `app_channels` row of `type = 'telegram'` stores one bot token
- the channel still binds to exactly one assistant
- many approved Telegram DM chats can be paired to that one channel
- each approved Telegram DM chat maps to one local thread through the existing `channelId + remoteChatId` binding

### 2. Pairing stays close to OpenClaw

- unknown Telegram DMs do not reach the assistant
- the app creates or refreshes a pending pairing record
- the bot replies with a short uppercase code
- the TIA Studio owner approves, rejects, or revokes requests from the UI
- approved users can continue chatting without repeating setup unless revoked later

### 3. Desktop approval is the trust boundary

The visible pairing code is a human-friendly identifier, not the real security control. The real control is the persisted allowlist row for `channelId + remoteChatId + senderId`.

This keeps setup simple:

- the end user only needs to DM the bot once
- the owner does not need to paste JWTs or one-time secrets
- the bot does not need a special `/pair` command

### 4. Telegram-specific pairing logic stays inside the Telegram adapter

The existing router already assumes that inbound channel events are ready to execute. For v1, the simplest design is:

- Telegram transport receives updates
- Telegram transport checks pairing state through a repository
- only approved messages are emitted onto `channel.message.received`
- pending, rejected, and revoked messages are handled inside the Telegram adapter

This avoids introducing a generic pre-router authorization subsystem before there is a second channel that needs it.

## Architecture

### Main-process layers

1. **Telegram transport adapter** in `src/main/channels/telegram-channel.ts`
   - owns Telegraf bot lifecycle
   - listens for Telegram text messages through long polling
   - ignores non-private chats
   - checks pairing state
   - emits normalized `ChannelMessage` events only for approved senders
   - sends pairing replies and assistant replies back to Telegram

2. **Existing channel service** in `src/main/channels/channel-service.ts`
   - registers the Telegram adapter for runtime-enabled Telegram channels
   - continues bridging approved inbound events and outbound send requests

3. **Existing channel router** in `src/main/channels/channel-message-router.ts`
   - remains responsible for creating/reusing TIA threads
   - persists Telegram-originated user messages in assistant history
   - publishes outbound text responses for the adapter to send

4. **Claws API and renderer**
   - create/update Telegram claws
   - list pending and approved pairings
   - approve, reject, and revoke pairings

### Telegram runtime flow

1. User creates a Telegram claw with `channel name + bot token`.
2. Runtime-enabled channel service starts the Telegram adapter.
3. Unknown user sends the bot a private text message.
4. Telegram adapter checks `app_channel_pairings`:
   - `approved` → emit normalized message to the event bus
   - `pending` and not expired → re-send pairing instructions with the existing code
   - missing or expired → create/refresh pending pairing and reply with a new code
   - `rejected` or `revoked` → reply with a blocked message and stop
5. Approved messages route through the existing assistant pipeline.
6. Assistant replies are published as `channel.message.send-requested`.
7. Telegram adapter sends the text reply to the Telegram DM chat.

## Data Model

### Existing channels table

Reuse `app_channels`:

- `type = 'telegram'`
- `config.botToken` stores the Telegram bot token

The existing JSON config shape remains appropriate because channel-specific credentials are already stored there for Lark.

### New pairings table

Add `app_channel_pairings`:

- `id TEXT PRIMARY KEY`
- `channel_id TEXT NOT NULL`
- `remote_chat_id TEXT NOT NULL`
- `sender_id TEXT NOT NULL`
- `sender_display_name TEXT NOT NULL DEFAULT ''`
- `sender_username TEXT`
- `code TEXT NOT NULL`
- `status TEXT NOT NULL`
- `expires_at TEXT`
- `approved_at TEXT`
- `rejected_at TEXT`
- `revoked_at TEXT`
- `last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

Indexes and constraints:

- unique index on `(channel_id, remote_chat_id, sender_id)`
- index on `(channel_id, status)`
- foreign key on `channel_id REFERENCES app_channels(id) ON DELETE CASCADE`

### Pairing states

- `pending` — waiting for desktop approval
- `approved` — allowed to reach the assistant
- `rejected` — explicitly denied by the owner
- `revoked` — previously approved but later blocked

### Code format

- 8 characters
- uppercase letters and digits
- avoid ambiguous characters such as `0`, `O`, `I`, `1`
- expires after 1 hour

### Pending request cap

Limit each Telegram channel to 3 active pending requests at a time. If the cap is reached, new unknown DMs are ignored until one pending request is approved, rejected, revoked, or expired. This stays close to OpenClaw and avoids spam-driven buildup.

## Threading and Message Metadata

Approved Telegram chats reuse the existing thread-binding model:

- binding key: `channelId + remoteChatId`
- value: local `threadId`

Telegram user messages are stored as normal assistant thread history with metadata:

- `fromChannel: "telegram"`
- `channelId`
- `channelType`
- `remoteChatId`
- `remoteMessageId`
- `senderId`
- optional `telegramUsername`
- optional `telegramDisplayName`

The current hardcoded Lark metadata path in `ChannelMessageRouter` should be generalized so it records the actual channel type instead.

## API Design

Keep Telegram under the existing claw surface rather than creating a separate Telegram feature area.

### Create/update claws

Extend the existing claw validator and route to support:

- `channel.type = 'telegram'`
- `channel.botToken`

The onboarding and edit flow should allow users to choose:

- Lark
- Telegram

### Pairing management endpoints

Add claw-scoped endpoints:

- `GET /v1/claws/:assistantId/pairings`
- `POST /v1/claws/:assistantId/pairings/:pairingId/approve`
- `POST /v1/claws/:assistantId/pairings/:pairingId/reject`
- `POST /v1/claws/:assistantId/pairings/:pairingId/revoke`

These remain claw-scoped in the API because the renderer is assistant-first, even though the rows are channel-owned under the hood.

### Claw list summaries

Extend `GET /v1/claws` to include lightweight pairing counts for Telegram channels:

- `pairedCount`
- `pendingPairingCount`

Lark channels can return zero for both fields.

## UI Design

### Claw editor

In the existing claw create/edit dialog:

- add a channel type selector
- for `telegram`, show:
  - channel name
  - bot token
- for `lark`, preserve the current `appId + appSecret` fields

### Claw cards

On Telegram claws, show:

- channel status
- paired user count
- pending pairing count
- `Manage Pairings` action

### Pairings dialog

Add a simple dialog for Telegram claws:

- pending requests first
- approved requests below
- each row shows display name, username, sender id, chat id, code, and timestamps
- actions:
  - `Approve`
  - `Reject`
  - `Revoke`

The owner should not need to type the short code manually. The code exists so they can match what the end user sees in Telegram.

## Error Handling

- invalid or revoked bot token should surface through `app_channels.last_error`
- Telegram startup failures should not crash the app; they should keep the claw visible with an error state
- non-text Telegram messages should be ignored in v1
- non-private chats should be ignored in v1
- expired pending requests should be replaced with a fresh code when the user DMs again
- approving a non-pending request should be idempotent where practical

## Security Notes

- the bot token is not the user identity boundary
- only rows with `status = 'approved'` can reach the assistant
- pairings are scoped per Telegram channel, so approving one bot does not approve another
- revoked users remain blocked until explicitly approved again
- pairing replies should avoid echoing untrusted user content

## Testing Strategy

- migration and repository coverage for the new pairing table
- Telegram adapter tests for:
  - pending creation
  - pending refresh
  - approved routing
  - revoked/rejected blocking
  - outbound send
  - non-private and non-text ignore paths
- router tests ensuring `fromChannel` is channel-type-aware
- claws route tests for Telegram create/update and pairing actions
- renderer tests for Telegram form fields, pairing counts, and pairings dialog actions

## Implementation Notes

- use `telegraf` long polling in v1 rather than webhooks
- keep the adapter testable by wrapping Telegraf behind a small injected interface
- do not add media or group support until text DM pairing is stable
- preserve the current assistant-first claw mental model throughout the UI
