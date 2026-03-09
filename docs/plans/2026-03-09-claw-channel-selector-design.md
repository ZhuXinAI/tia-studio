# Claw Channel Selector Design

## Context

The current claw editor mixes assistant editing with channel lifecycle management. In `/Users/windht/Dev/tia-studio/src/renderer/src/features/claws/components/claw-editor-dialog.tsx`, users currently see a `Channel Action` dropdown with options like `Keep current channel`, `Create new channel`, `Attach existing channel`, and `Detach current channel`.

That flow has three UX problems:

- it forces users to think in terms of actions instead of simply choosing a channel
- it hides the full configured channel inventory because the API only exposes unbound channels
- it scatters channel creation inside the claw editor without a reusable management surface

The approved direction is to replace that model with a dedicated channel selector dialog that matches the older settings-page mental model: pick from configured channels, add a new one inline, remove an unused one inline, or leave the claw without a channel.

## Goals

- replace `Keep current channel` and the other action-driven choices with a single channel selector dialog
- show all configured channels in one place, not only unbound ones
- preselect the current channel when editing an existing claw
- disable channels that are already bound to other assistants
- allow nested `Add Channel` and `Remove Channel` flows inside the selector
- allow a claw to exist without a channel, while keeping it disabled until a channel is configured
- keep Telegram pairing support intact after the selector migration

## Non-goals

- no separate standalone Channels settings page in this pass
- no editing of existing channel credentials in this pass
- no bulk channel management UI
- no removal of the existing backend `channel.mode === "create"` API support unless it becomes dead code later
- no redesign of pairing management beyond preserving the current Telegram pairing entry point

## Approved Product Behavior

### Claw editor

The claw editor should keep assistant-focused fields only:

- assistant name
- provider
- instructions
- enabled toggle
- selected channel summary plus a `Select Channel` button

The editor should no longer expose a `Channel Action` dropdown or inline raw channel credential fields.

Instead, the selected channel area should show one of these states:

- current or chosen channel summary
- `No channel selected` warning state

Saving rules:

- new claw + selected channel → save the claw and attach that channel
- existing claw + unchanged selected channel → save with `keep`
- existing claw + different selected channel → save with `attach`
- existing claw + cleared selection → save with `detach`
- new claw + no selected channel → save assistant only

### Channel selector dialog

The selector dialog should open from the claw editor and display every configured channel in a single list.

Each row should show:

- channel name
- channel type (`Lark` or `Telegram`)
- connection status when available
- assistant usage state:
  - `In use by this claw`
  - `In use by another assistant`
  - `Available`
- Telegram pairing counts when present

Selection rules:

- current channel is preselected when editing an existing claw
- unbound channels are selectable
- the current claw's own bound channel remains selectable
- channels bound to other assistants remain visible but disabled

Actions inside the dialog:

- `Add Channel`
- `Remove Channel`
- `Clear Selection`
- `Cancel`
- `Apply`

### Nested add dialog

Clicking `Add Channel` opens a small nested dialog inside the selector workflow.

It should:

- let the user choose `Lark` or `Telegram`
- collect the same required credentials the current claw editor already supports
- create the channel as unbound
- refresh the configured channel list
- auto-select the newly created channel in the selector after success

This keeps channel creation reusable and decoupled from claw saving.

### Nested remove confirmation

Clicking `Remove Channel` opens a small confirmation dialog for the currently highlighted channel.

Removal rules:

- only persisted unbound channels can be removed
- channels in use by any assistant cannot be removed
- a channel that is currently attached to the claw being edited is still considered in use and cannot be deleted until the user detaches it and saves first

If the server rejects removal because the channel became bound concurrently, the dialog should show the error and refresh the list.

## API and Data Direction

### Configured channel inventory

`GET /v1/claws` should return the full configured channel inventory instead of only `availableChannels`.

Each configured channel record should include enough metadata for the selector UI:

- `id`
- `type`
- `name`
- `assistantId`
- `assistantName`
- `status`
- `errorMessage`
- `pairedCount`
- `pendingPairingCount`

The renderer can then derive:

- whether the row is selectable
- whether the row is removable
- whether it belongs to the currently edited claw

### Dedicated channel management endpoints

The selector should manage channels through dedicated endpoints instead of encoding channel creation inside the claw save flow.

Recommended endpoints:

- `POST /v1/claws/channels`
- `DELETE /v1/claws/channels/:channelId`

Rules:

- create saves a new unbound configured channel
- delete only succeeds for unbound channels
- bound channel deletion returns `409`

This is the cleanest root-cause fix because the claw editor becomes a consumer of configured channels instead of a place where channel records are authored and destroyed indirectly.

### No-channel invariant

A claw without a channel is valid, but it should not end up enabled.

Client behavior:

- allow save with no selected channel
- disable the `Enable` button on cards with no channel
- show a warning-style message like `Configure a channel first`

Server behavior:

- if a create or update would leave the final claw without a channel, coerce `enabled` to `false`

That server-side invariant protects against stale UI state or direct API calls.

## Error Handling

- selector inventory load failure should remain local to the dialog and offer retry
- add-channel validation errors should stay inside the nested dialog
- remove failures should keep the selector open and refresh stale data
- attach failures caused by a channel being claimed concurrently should surface the backend error
- saving with no channel should succeed, but the resulting claw should be disabled

## Testing Strategy

Renderer coverage should prove:

- current channel is preselected
- channels bound to other assistants are disabled
- clearing selection detaches or omits the channel payload correctly
- nested add creates a selectable channel
- nested remove is blocked for in-use channels
- cards with no channel show warning copy and disable the enable button

Main-process coverage should prove:

- the claws list returns full configured channel metadata
- unbound channel creation works
- unbound channel deletion works
- bound channel deletion returns `409`
- claws without channels are persisted as disabled

## Implementation Notes

- preserve the current Telegram pairing management dialog and pairing counts
- keep the existing `channel.mode` API variants for claw save compatibility, even if the new renderer mainly uses `attach`, `detach`, and `keep`
- prefer page-level mutations with a pure editor dialog so the new selector remains easy to test
