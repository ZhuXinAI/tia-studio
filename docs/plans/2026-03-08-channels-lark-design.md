# Channels / Lark Integration Design

## Context

TIA Studio currently supports local assistant and team chat flows, but it does not have a transport layer for remote channels such as Lark or Telegram. The new `Channels` feature needs to let external conversations enter the app, route into one bound assistant, and remain visible inside normal TIA thread history.

The reference implementation in `/Users/windht/Dev/Buildmind2026/tia-gateway/src/mastra/channels` already proves two important ideas:

- transport adapters should normalize inbound messages into a shared contract
- an event bus is a clean boundary between channel IO and agent execution

For TIA Studio, the same separation is needed, but the runtime must also persist channel-originated messages into local thread history so the conversations stay visible in the desktop UI.

## Goals

- add a main-process event bus for channel traffic
- keep channel transport code separate from assistant execution logic
- let each configured channel bind to exactly one assistant
- map each remote Lark conversation to one local TIA thread
- persist channel-originated messages into normal assistant thread history with `metadata.fromChannel`
- add a Settings page for Channels with Lark credentials and assistant selection

## Non-goals

- no Telegram implementation in this pass
- no multi-assistant routing per channel
- no custom UI treatment for channel messages beyond preserving metadata and rendering them in normal history
- no generalized channel workflow builder or automation layer

## Product Direction

### Main-process boundaries

The feature should be split into three layers:

1. **Channel transport layer** in `src/main/channels/*`
   - owns Lark websocket/session lifecycle
   - normalizes platform payloads into a shared `ChannelMessage`
   - publishes inbound events
   - listens for outbound delivery events and sends replies back to the platform

2. **Channel routing layer** in main process
   - subscribes to inbound channel events
   - resolves the configured assistant binding
   - resolves or creates the mapped local thread
   - forwards the synthetic user message into the assistant runtime
   - publishes outbound reply events for the transport layer

3. **Assistant runtime / persistence layer**
   - remains responsible for storing thread history in Mastra memory
   - keeps `app_threads` as the local thread registry
   - exposes thread history back to the renderer as normal

This separation keeps the channel service limited to pub/sub plus transport IO, which matches the requirement that the assistant system receives channel events instead of being embedded inside the channel implementation.

### Event bus contract

The main-process event bus should start with two events:

- `channel.message.received`
  - published by transport adapters
  - contains normalized message, channel identity, and raw transport metadata

- `channel.message.send-requested`
  - published by the routing/assistant side
  - contains target channel, remote chat id, and final reply text to send
  - uses a plain `content` string payload for the outbound reply body

This keeps the bus intentionally small for v1 while still supporting full request/reply behavior.

### Channel identity and assistant binding

Each saved channel record should include:

- stable local `id`
- `type` (`lark` in v1)
- user-visible `name`
- `enabled`
- bound `assistantId`
- channel config payload

Each configured channel binds to exactly one assistant. Every inbound message from that channel routes to the bound assistant without additional per-message assistant selection.

### Thread mapping

Each remote Lark conversation maps to one local `app_threads` row:

- mapping key: `channelId + remoteChatId`
- mapped value: `threadId`

When an inbound Lark conversation is seen for the first time:

- create a local thread for the bound assistant
- use the existing default profile resource id (`default-profile`) to match current app behavior
- initialize the title as `New Thread` so existing title-generation logic can replace it automatically after the assistant run

Subsequent messages from the same remote Lark conversation reuse the same local thread.

### Thread history requirements

Channel-originated messages must be persisted into assistant thread history as normal user messages. Their message metadata should include:

- `fromChannel: "lark"`
- `channelId`
- `channelType`
- `remoteChatId`
- `remoteMessageId`
- optional transport-specific metadata such as sender identifiers

This ensures the messages appear in TIA Studio history while remaining distinguishable from messages typed in the desktop UI.

### Lark adapter

The Lark transport should follow the same high-level shape as the gateway reference:

- websocket-based inbound listening
- REST API for outbound replies
- normalized `chat_id`, `message_id`, sender ids, and text content
- support for simple text send in v1

Rich outbound media can stay out of scope for the initial TIA Studio pass.

### Settings page

Add a dedicated `Channels` page under Settings. The first version only needs one Lark configuration card/form:

- enable / disable
- channel display name
- `app_id`
- `app_secret`
- bound assistant selector
- setup guide link
- connection status / last error area if available

The backend model should still be generic enough for future Telegram support, but the renderer only needs to expose the Lark path now.

## Error Handling

- invalid or incomplete Lark settings should keep the channel disconnected and surface the validation or runtime error in Settings
- a missing bound assistant should prevent routing and record an actionable error instead of dropping messages silently
- if no thread mapping exists, the router should create one automatically
- if the assistant run fails, the inbound message should still remain in local history
- outbound send failures should not delete local assistant replies; they should surface as channel delivery errors

## Testing Strategy

### Main process

- event bus publish / subscribe behavior
- channel config persistence and thread mapping persistence
- Lark message normalization
- channel service lifecycle (`start`, `stop`, `reload`)
- routing from inbound channel event to assistant runtime
- metadata persistence with `fromChannel: "lark"`
- outbound reply publication and transport delivery

### Renderer

- Settings sidebar includes `Channels`
- router resolves `/settings/channels`
- Lark settings page loads assistants and saved config
- save behavior updates the local page state
- setup guide link is rendered

## Open Implementation Assumptions

- v1 sends assistant text replies back to the same Lark chat because a one-way ingress would not be useful enough for a remote channel feature
- v1 does not add a special badge to channel messages in the thread UI; preserving metadata and rendering messages in normal history is sufficient
- v1 targets one manageable Lark configuration in the UI, even if the persistence model allows multiple future channel records
