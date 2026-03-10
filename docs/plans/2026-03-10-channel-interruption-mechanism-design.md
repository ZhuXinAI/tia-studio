# Channel Interruption Mechanism Design

## Overview

Add per-conversation interruption control for inbound channel conversations so a second user message arriving during an active assistant run is handled intentionally instead of racing the current run.

The goal is to make channel conversations behave more like a human conversation: normal follow-ups wait their turn, urgent priority changes can interrupt, and interrupted work can be resumed explicitly.

## Goals

1. Scope run control per remote conversation (`channelId + remoteChatId`)
2. Decide whether a new inbound message should `queue` or `interrupt`
3. Abort the active run immediately when interruption is chosen
4. Preserve interrupted work for explicit resume
5. Avoid generic error replies for intentional aborts

## Non-goals

- Exact mid-tool resume from partial execution state
- Automatic background resume without user intent
- Complex priority tiers beyond queue vs interrupt
- Applying the mechanism to the desktop composer, which already blocks resubmission while streaming

## Existing Root Cause

`ChannelMessageRouter.handleInboundEvent()` currently starts a new `assistantRuntime.streamChat()` call for every inbound channel message immediately.

That means two user messages from the same remote chat can create overlapping runs against the same thread. Because channel delivery is progressive, the later message can effectively “jump the line” and produce a response pattern that feels unnatural.

## Architecture

### 1) Conversation execution state

Keep router state per conversation key:

- `activeRun`: current work item plus `AbortController`
- `queue`: FIFO pending inbound messages
- `pausedTasks`: interrupted messages waiting for manual resume
- `controlChain`: serialized mutation path so concurrent webhooks cannot corrupt state

Conversation key format: `${channelId}:${remoteChatId}`.

### 2) Queue vs interrupt decision

When a new inbound message arrives while a run is active:

- `interrupt` for clear stop / cancel / switch-priority intent
- `queue` for ordinary follow-ups or additional details

The initial implementation uses a deterministic heuristic decider to keep latency and complexity low while matching the reference behavior contract.

### 3) Hard stop + pause

When the decision is `interrupt`:

1. Clone the active work item into `pausedTasks`
2. Abort the live run via `AbortController.abort()`
3. Put the new work item at the front of `queue`
4. Start the new work item immediately after cleanup

Aborts are treated as control flow, not failures.

### 4) Explicit resume contract

Detect strict resume commands, for example:

- `continue`
- `resume`
- `go on`
- `继续`
- `接着`

If there is a paused task and no active run:

1. pop the newest paused task
2. enqueue it at the front
3. run it with a `resumed` flag so the router does not treat the resume command itself as user content

If there is no paused task, send a short status reply.

## Data Flow

### Normal path

1. Inbound channel message arrives
2. No active run exists for the conversation
3. Enqueue and start processing immediately
4. When complete, consume the next queued item

### Queue path

1. Inbound message arrives during an active run
2. Decider returns `queue`
3. Append the new work item to the queue
4. Send a short acknowledgement
5. Process it after the active run finishes

### Interrupt path

1. Inbound message arrives during an active run
2. Decider returns `interrupt`
3. Pause and abort the active run
4. Queue the new message at the front
5. Start the new message next
6. Resume only if the user later sends an explicit resume command

## Files To Change

- `src/main/channels/channel-message-router.ts`
- `src/main/channels/channel-message-router.test.ts`
- `docs/plans/2026-03-10-channel-interruption-mechanism.md`
