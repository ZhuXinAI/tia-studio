# Channel Bindings in TIA Studio

`Channel Binding` is the user-facing term for pairing one assistant with one channel.

## Model

- Internal identity stays assistant-first (`app_assistants` + `assistantId`).
- Channel linkage stays on `app_channels.assistantId`.
- No separate `channel_bindings` table is introduced in this pass.

## Compatibility

- Existing backend routes remain on `/v1/claws`.
- The list response now includes both:
  - `claws` (legacy field)
  - `channelBindings` (rebrand alias)
- Renderer logic accepts either field and normalizes to the same data shape.

## Why this shape

- Preserves assistant/thread/team/cron/heartbeat ownership by `assistantId`.
- Avoids broad persistence/runtime migrations.
- Lets UI and docs rebrand immediately without breaking older clients.

## Product framing

- **Agent**: reusable assistant identity.
- **Team**: primary collaboration surface.
- **Channel Binding**: one channel paired to one agent.
- **Studio features**: advanced TIA-native capabilities layered on top.
