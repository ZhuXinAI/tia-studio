# Pi migration: v3 harness cutover

Status: implementation contract
Last reconciled: 2026-07-16
Decision record: `docs/adr/0001` through `docs/adr/0012`

## Outcome

TIA Studio v3 embeds the pinned `@earendil-works/pi-coding-agent@0.80.8` SDK inside Electron main as its only coding-agent harness. Electron main owns `ModelRuntime`, `AgentSession`, session persistence, provider secrets, permissions, and the authenticated local HTTP/SSE API. The renderer owns presentation and adapts the application message model to the official assistant-ui thread.

This is a destructive cutover. There is no legacy runtime flag or compatibility path.

## Data cutover

The one-time v3 migration:

- Deletes all previous conversation history and any partially-created Pi session history.
- Drops the old agent-entity, thread, message-usage, and workspace-member ownership tables.
- Removes agent IDs from channels.
- Replaces channel/thread bindings with channel/Pi-session bindings.
- Preserves providers, workspace records, configured channels, and pairing state.
- Creates application-owned Pi session, normalized message, ordered event, and channel-session tables.
- Records a durable migration marker so the destructive cutover runs once.

Pi begins with an empty session index. No old messages are imported or replayed.

## Runtime ownership

One application-owned `AgentRuntimeManager` hosts all Pi work:

- One in-process Pi `AgentSession` per live application session.
- The same runtime is used by desktop chat, channels, and automation-triggered work.
- A session remains live while the renderer navigates elsewhere.
- A persisted session resumes from its Pi session file after restart.
- `ModelRuntime` receives the selected provider credential in memory.
- `SessionManager` owns only the session file selected by the application.
- Application shutdown aborts and disposes every embedded session.

TIA Studio never launches the Pi CLI, RPC mode, a standalone Node runtime, or a global `pi` binary.

## Transport

The renderer uses the authenticated local HTTP/SSE boundary already used by the desktop shell.

Commands are validated HTTP requests. Ordered application events are delivered over SSE. Pi SDK objects, provider keys, and Pi-specific event shapes never cross into the renderer. A typed adapter subscribes to `AgentSession` events and maps them into the application contract.

## Application contract

`src/shared/agent-runtime.ts` is canonical for:

- session snapshots;
- normalized messages and content parts;
- interaction requests and responses;
- commands and receipts;
- ordered runtime events;
- the idempotent renderer reducer.

Pi types and assistant-ui types are adapters at the edges and are not persisted.

## Message-to-runtime mapping

The renderer's assistant-ui external-store adapter maps actions as follows:

| UI action              | Application command           | Embedded Pi SDK call          |
| ---------------------- | ----------------------------- | ----------------------------- |
| New idle message       | `sendMessage(..., normal)`    | `session.prompt`              |
| Steer while running    | `sendMessage(..., steer)`     | `session.steer`               |
| Queue follow-up        | `sendMessage(..., follow-up)` | `session.followUp`            |
| Stop generation        | `cancelRun`                   | `session.abort`               |
| Rename thread          | `renameSession`               | `session.setSessionName`      |
| Change model           | `setModel`                    | `session.setModel`            |
| Change thinking        | `setThinkingLevel`            | `session.setThinkingLevel`    |
| Resolve approval/input | `respondToInteraction`        | application UI bridge promise |

User text is stored once in the application message table before the command is sent. Image attachments are normalized as base64 image parts, rendered through assistant-ui, and passed to Pi's `images` field. Pi text, thinking, tool lifecycle, queues, retries, compaction, interactions, and exits are mapped to ordered application events and reduced idempotently into session/message state.

A failed recovery does not synthesize or replay a user message.

## Providers and credentials

TIA Studio remains the provider/model configuration source. Electron main reads the chosen provider record and creates the minimal Pi environment for that one session.

Raw keys are not returned by provider list/update APIs and are never persisted in Pi `models.json`. Electron main applies only the selected provider key to the session's in-memory `ModelRuntime`; no provider credential is copied into a child-process environment.

## Workspaces and preboot

The built-in Chats workspace is an isolated application-managed directory. It starts empty.

TIA Studio no longer creates or injects identity, soul, memory, prompt, or hidden-agent files. Backend code does not assemble an agent prompt. Pi owns its standard coding behavior. Workspace-native files that Pi itself supports are governed by Pi, not copied or generated by TIA Studio.

Deeper skill-loading policy is a separate future product decision. V3 does not recreate the removed preboot system.

## Permissions

Every new session starts in persisted Standard Access.

Standard Access automatically permits routine reads, non-destructive commands, and writes inside the selected workspace. It requests an in-thread confirmation for destructive commands, privilege escalation, and writes outside the workspace.

A visible per-thread Full access switch persists its state and skips approval gates, like Codex Full Access. It never permits access to TIA Studio credential storage. Provider storage, channel authentication data, SSH/GPG material, environment files, and other recognized credential paths remain blocked in both modes.

Pending channel-triggered approval is persisted on the ordinary Pi session and therefore appears in the desktop thread. The channel run waits for the interaction response.

## Thread UI

The existing AppV2 shell and thread-list presentation remain. The old thread canvas and transport are deleted.

The thread canvas is the component installed by:

```sh
npx shadcn@latest add @assistant-ui/thread
```

It is backed by `useExternalStoreRuntime` and supports:

- `ThreadEmpty`;
- streaming text and reasoning;
- accumulated tool input/output state;
- errors and recovery state;
- image attachment;
- feature-detected Web Speech dictation;
- copy and cancel;
- rename;
- steer/follow-up mode while running;
- permission/input interactions;
- Standard/Full Access.

Edit, regenerate, export, and branch controls are absent because the application does not implement those semantics in this cut.

## Channels and automations

Channels no longer bind to a separate agent entity. Each remote conversation creates or resumes a normal Pi session in Chats using the default enabled provider. `/new` creates a new session and `/stop` cancels the active run. Concurrent inbound turns are handled deterministically; no backend model call decides routing.

Automation-triggered executions create ordinary Pi sessions in their named workspace and use this same runtime contract. TIA owns the automation records, scheduling, CRUD lifecycle, and run history; Codex schedules are not imported.

## Explicit exclusions

The v3 harness contains only the locally embedded Pi SDK. Pi CLI/RPC execution, alternative agent harnesses, adapter layers for other agent frameworks, delegated coding providers, SSH/container/cloud execution, and general multi-agent orchestration are not part of this architecture and must not remain as dormant implementation or deferred switches.

Branch UI, manual compaction UI, statistics UI, and a deeper skill-loading design may be considered independently after the main harness is stable.

## Completion gates

The cutover is complete only when:

- focused decoder, mapper, client, repository, migration, permission, route, channel, and renderer tests pass;
- lint, full typecheck, full tests, and production build pass;
- a real desktop Pi task streams text/reasoning/tools;
- navigation does not stop a live run;
- restart resumes the session without prompt replay;
- images and supported native dictation work;
- Standard Access approval and Full access are exercised;
- the packaged embedded Pi SDK works without a Pi child process;
- app exit aborts and disposes every live SDK session;
- desktop E2E runs through the bounded guarded launcher and is terminated on repeated session creation, repeated 5xx responses, or sustained excessive process-tree CPU;
- repository searches show no live legacy harness, old agent entity, preboot, alternate harness, or remote-execution implementation.
