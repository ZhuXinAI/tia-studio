# Channel Startup Resilience Design

## Context

TIA Studio currently starts channel transports during main-process boot by awaiting `channelService.start()`. That service iterates enabled channels and awaits each adapter's `start()` method before the app continues.

This is fragile for two different reasons:

- one adapter failure can abort startup for every other channel
- one adapter that never resolves its startup promise can stall the entire app boot sequence

The current Telegram adapter is the concrete example. Its startup path awaits Telegraf long polling, which is effectively a process-lifetime task rather than a short readiness handshake. As a result, app startup can appear hung as soon as a Telegram channel is enabled.

## Goals

- keep app startup responsive even when one or more channels are broken
- ensure `channelService.start()` always resolves within a bounded time
- mark failed channels unhealthy via `lastError`
- clear stale `lastError` when a channel starts successfully
- keep retry behavior manual through the existing UI reload flow

## Non-goals

- no automatic background retry loop
- no renderer/UI redesign
- no new channel lifecycle dashboard or metrics layer
- no transport-specific retry policy in this pass

## Recommended Approach

### 1. Define a non-blocking adapter startup contract

`ChannelAdapter.start()` should mean:

- perform the minimal startup handshake required to begin receiving/sending messages
- return once that handshake is complete
- not remain pending for the entire lifetime of the transport session

This keeps adapter startup compatible with app boot. Long-lived polling or websocket loops may continue in the background after `start()` resolves.

### 2. Make `ChannelService` resilient per channel

`ChannelService.start()` should:

- subscribe to outbound send events once
- load all runtime-enabled channels
- attempt each channel startup independently
- continue starting other channels even if one channel throws or times out
- resolve after all startup attempts finish or time out

Each channel attempt should be wrapped in a bounded timeout. If a channel does not finish startup within the timeout window, the service should treat it as failed, record the timeout error, and continue booting.

### 3. Persist health in `app_channels.last_error`

Channel health should reuse the existing `last_error` column:

- on successful adapter startup: set `lastError` to `null`
- on failed startup: set `lastError` to a readable error string

This keeps the current UI/API shape intact and lets the existing settings surface show unhealthy state without adding a new schema.

### 4. Fix Telegram startup at the root cause

The Telegram adapter should stop treating long polling as a blocking startup step. Its startup should:

- register the inbound text handler
- complete the Telegram readiness handshake
- launch long polling in the background
- resolve promptly once the adapter is considered started

That keeps the adapter aligned with the shared startup contract while preserving normal runtime behavior.

## Data Flow

1. Main process calls `channelService.start()`.
2. `ChannelService` fetches runtime-enabled channels.
3. For each channel:
   - build adapter
   - attempt `adapter.start()` with timeout protection
   - on success: register adapter and clear `lastError`
   - on failure: skip registration and persist `lastError`
4. App startup continues regardless of per-channel outcomes.
5. UI-triggered reload retries the same startup flow for failed channels.

## Error Handling

- Startup failures should be isolated to the channel that failed.
- Timeout failures should produce a readable message such as `Channel startup timed out.`
- Unknown thrown values should be normalized to strings before persistence.
- Failed channels must not be added to the live adapter map, so outbound sends are ignored until a successful reload.

## Testing Strategy

Add regression coverage for:

- startup continues when one adapter rejects
- startup continues when one adapter never resolves and times out
- successful channels still register and receive outbound sends
- failed channels persist `lastError`
- successful starts clear a stale `lastError`
- Telegram startup resolves promptly instead of waiting on the lifetime polling promise

## Open Decisions Resolved

- **Retry strategy:** manual retry only, initiated from the UI
- **Health surface:** reuse `lastError`
- **Boot behavior:** app startup must never hang on channel connectivity
