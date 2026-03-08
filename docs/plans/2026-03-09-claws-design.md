# Claws Page Design

## Summary

`Claws` becomes the user-facing setup surface for connecting assistants to external channels. The key domain decision is that **assistant is the claw**. We do not introduce a new `claw` entity. Instead, we give assistants a runtime activation flag and let the `Claws` page orchestrate three things in one place:

- quick assistant creation,
- channel attachment/detachment,
- activation of external/background behavior.

This keeps identity, memory, heartbeat, and future cron behavior owned by the assistant while letting channels stay transport integrations.

## Product Decisions

### 1. Assistant is the claw

- `app_assistants` remains the primary record.
- `app_channels` remains a separate transport record.
- A claw card on the new page is an assistant plus its attached channel summary.

### 2. Channel setup moves out of Settings

- Remove `Channels` from the settings sidebar.
- Remove the dedicated channels settings page.
- Add a top-nav `Claws` entry as the recommended setup flow.
- Keep `/settings/channels` only as a compatibility redirect to `/claws`, not as a real page.

### 3. Multiple Lark channels are supported

- The app must stop assuming there is only one Lark channel.
- Users can create multiple Lark channel records with different `appId` / `appSecret` pairs.
- In v1, each assistant can attach to at most one channel and each channel can attach to at most one assistant.

### 4. Runtime activation is assistant-driven

- Add `enabled` to assistants.
- Channel connection only starts when the attached assistant is enabled.
- Heartbeat and future cron behavior conceptually belong to the assistant and must also honor `assistant.enabled`.
- Channel-level enablement stops being a user-facing switch.

## UX

## Top Navigation

- Add `Claws` beside `Home` and `Team`.
- Selecting `Claws` opens `/claws`.

## Page States

### Onboarding-first state

Show the onboarding panel whenever there are **no non-built-in assistants with an attached channel**.

This panel should remain visible even if the user already has assistants without channels, so they get a quick “finish setup” path instead of a confusing empty list.

The onboarding panel contains a compact form:

- assistant name,
- provider selection,
- optional instructions,
- inline Lark channel fields:
  - channel name,
  - `appId`,
  - `appSecret`,
- `Create Claw` primary action.

Successful submission:

1. creates the assistant,
2. creates the Lark channel,
3. attaches the channel to that assistant,
4. enables the assistant when setup is complete.

### Management state

Below the onboarding panel—or as the primary content once claws exist—show all non-built-in assistants as cards.

Each card shows:

- assistant name,
- provider/model summary,
- channel summary or `No channel connected`,
- activation status,
- quick actions: enable/disable, edit, delete.

### Editing behavior

Editing stays intentionally minimal in v1:

- assistant:
  - `name`,
  - `provider`,
  - optional `instructions`,
  - `enabled`,
- channel:
  - keep current channel,
  - attach an available unbound channel,
  - create a new Lark channel inline,
  - detach the current channel.

If a channel is already attached to another assistant, it is excluded from selection.

## Built-in Default Assistant Handling

The app seeds a built-in default assistant automatically. That assistant is not treated as a user claw.

- Hide the built-in assistant from the `Claws` page.
- Exclude it when deciding whether to show onboarding.
- Continue protecting it from deletion through existing safeguards.

## Data Model

## Assistants

Add an `enabled` flag to `app_assistants`.

Behavior:

- new assistants created from general assistant flows default to `false`,
- assistants created through the onboarding flow default to `true` once channel setup succeeds,
- existing assistants bound to channels are backfilled to `enabled = true`,
- existing assistants without channel bindings are backfilled to `enabled = false`.

We do **not** add separate heartbeat or cron tables in this slice. Their ownership moves conceptually to assistants, and future runtime work must query assistant activation through the same gate.

## Channels

Keep `app_channels` as the transport table.

- Channels may exist unattached.
- Multiple rows with `type = 'lark'` are valid.
- `assistant_id` remains the binding column.
- Deleting an assistant leaves its channel unattached via the existing foreign-key behavior.

`app_channels.enabled` remains a legacy/internal implementation detail during migration, but runtime behavior must be driven by the attached assistant’s `enabled` flag.

## API Design

Add assistant-centric orchestration endpoints:

- `GET /v1/claws`
- `POST /v1/claws`
- `PATCH /v1/claws/:assistantId`
- `DELETE /v1/claws/:assistantId`

### `GET /v1/claws`

Returns:

- `claws`: non-built-in assistants with attached channel summary,
- `availableChannels`: unattached channels for inline reassignment,
- optionally assistants with no channel still appear in `claws` as `channel: null`.

Example response shape:

```ts
type ClawsResponse = {
  claws: Array<{
    id: string
    name: string
    providerId: string | null
    instructions: string
    enabled: boolean
    isBuiltIn: false
    channel: null | {
      id: string
      type: 'lark' | string
      name: string
      status: 'disconnected' | 'connected' | 'error'
      errorMessage: string | null
    }
  }>
  availableChannels: Array<{
    id: string
    type: 'lark' | string
    name: string
  }>
}
```

### `POST /v1/claws`

Creates a new assistant and optionally a new channel in one request. The onboarding form uses this path.

### `PATCH /v1/claws/:assistantId`

Updates:

- minimal assistant fields,
- activation flag,
- current channel attachment,
- or creates a new channel inline and attaches it.

### `DELETE /v1/claws/:assistantId`

Deletes the assistant. The attached channel becomes unbound and reusable.

All mutating routes reload channel runtime after persistence succeeds.

## Runtime Behavior

## Channel activation

The channel service must stop loading “all enabled channels” and instead load channels whose attached assistant is enabled.

The runnable-channel rule is:

1. channel has an attached assistant,
2. attached assistant is enabled,
3. channel has valid required credentials,
4. channel type is supported by the adapter registry.

## Heartbeat / Cron contract

This slice formalizes the ownership and activation contract, even though a general cron scheduler does not exist yet in the current codebase.

Future heartbeat or cron runners must:

- resolve work by assistant,
- skip disabled assistants,
- never treat channels as the owner of scheduled behavior.

## Migration Strategy

1. Add `enabled` to `app_assistants`.
2. Backfill `enabled = 1` for assistants referenced by existing channels.
3. Backfill `enabled = 0` for assistants with no channel bindings.
4. Leave channels intact; do not delete or collapse multiple Lark rows.
5. Replace the single-channel settings API with the new claws API.
6. Redirect `/settings/channels` to `/claws`.

## Validation Rules

- Reject attaching a channel that is already bound to another assistant.
- Reject creating a claw without a valid provider.
- Allow multiple Lark channels as long as each record has its own credentials.
- Allow assistants without channels, but show them as incomplete claws.
- Allow manual chat use of assistants even when disabled; `enabled` only gates external/background runtime behavior.

## Testing Strategy

- migration test for the new assistant `enabled` column and backfill,
- repository tests for assistant persistence and multiple Lark channels,
- route tests for claw create/edit/delete/toggle and duplicate-channel rejection,
- service tests proving only enabled assistants start channel adapters,
- renderer tests for onboarding, list state, inline channel creation, and top-nav routing.

## Non-Goals

- No separate `claw` table.
- No generic scheduler implementation in this slice.
- No full assistant editor inside the `Claws` page.
- No removal of assistant chat functionality from existing screens.
