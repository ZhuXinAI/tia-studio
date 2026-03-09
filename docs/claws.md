# Claws Feature Documentation

## Overview

Claws is the user-facing management surface for connecting AI assistants to external channels (e.g., Lark). The core design principle is that **an assistant IS the claw** — there is no separate "claw" entity in the database. A claw is a composed view of an assistant + its attached channel.

### Purpose

- Provide a unified setup flow for creating assistants and binding them to external channels
- Allow users to manage activation (enable/disable) of assistant-channel pairs
- Support multiple Lark channels with different credentials
- Serve as a lightweight management page at `/claws`

## File Structure

### Backend (Main Process)

| File | Description |
|------|-------------|
| `src/main/server/routes/claws-route.ts` | Hono route handlers (CRUD) |
| `src/main/server/routes/claws-route.test.ts` | Route tests |
| `src/main/server/validators/claws-validator.ts` | Zod request schemas |
| `src/main/persistence/repos/assistants-repo.ts` | Assistant persistence with `enabled` flag |
| `src/main/persistence/repos/channels-repo.ts` | Channel persistence |
| `src/main/persistence/migrate.ts` | Migration for `enabled` column on assistants |
| `src/main/channels/channel-service.ts` | Runtime channel activation |
| `src/main/default-agent/default-agent-bootstrap.ts` | Built-in agent marker |

### Frontend (Renderer)

| File | Description |
|------|-------------|
| `src/renderer/src/features/claws/claws-query.ts` | TanStack Query hooks & API functions |
| `src/renderer/src/features/claws/claws-query.test.ts` | Query tests |
| `src/renderer/src/features/claws/pages/claws-page.tsx` | Main page component |
| `src/renderer/src/features/claws/pages/claws-page.test.tsx` | Page tests |
| `src/renderer/src/features/claws/components/claw-editor-dialog.tsx` | Create/edit dialog |
| `src/renderer/src/features/claws/components/claw-editor-dialog.test.tsx` | Dialog tests |

### Navigation & Routing

- Route registered in `src/renderer/src/app/router.tsx` at `/claws`
- Top nav item in `src/renderer/src/app/layout/app-shell.tsx`
- `/settings/channels` redirects to `/claws` for backward compatibility

## Data Model

### Key Principle

No `claws` table exists. Claws are a composed view:

```
Claw = Assistant (with enabled flag) + Channel (optional, at most one per assistant)
```

### Assistant (`app_assistants`)

The `enabled` column (INTEGER, default 0) controls runtime activation. When `enabled = 1`, the assistant's attached channel will be started by ChannelService.

### Channel (`app_channels`)

Channels store external service credentials (e.g., Lark appId/appSecret). Key fields:

- `assistant_id` — foreign key to assistant (NULL = unbound/reusable)
- `enabled` — channel-level toggle
- `config` — JSON with service-specific credentials
- `last_error` — last error message from runtime

### Frontend Type (`ClawRecord`)

```typescript
type ClawRecord = {
  id: string           // assistant ID
  name: string
  description: string
  instructions: string
  providerId: string | null
  enabled: boolean
  channel: null | {
    id: string
    type: string
    name: string
    status: 'connected' | 'disconnected' | 'error'
    errorMessage: string | null
  }
}
```

## REST API

All routes under `/v1/claws`, protected by bearer token auth.

### `GET /v1/claws`

Lists non-built-in assistants as claws with channel summary + available unbound channels.

Response: `{ claws: ClawRecord[], availableChannels: { id, type, name }[] }`

### `POST /v1/claws`

Creates a new assistant + optional channel in one request.

```json
{
  "assistant": { "name": "...", "providerId": "...", "instructions": "...", "enabled": true },
  "channel": { "mode": "create", "type": "lark", "name": "...", "appId": "...", "appSecret": "..." }
}
```

### `PATCH /v1/claws/:assistantId`

Updates assistant fields and/or channel attachment. Channel mode can be: `create`, `attach`, `detach`, `keep`.

### `DELETE /v1/claws/:assistantId`

Deletes the assistant. Attached channel becomes unbound (reusable). Returns 204.

## Runtime Activation

Activation is **assistant-driven**. A channel is started only when ALL of:

1. `channel.enabled = 1`
2. `channel.assistant_id IS NOT NULL`
3. `assistant.enabled = 1` (joined from `app_assistants`)

This is implemented via `channelsRepo.listRuntimeEnabled()` and consumed by `ChannelService`.

Every claws mutation calls `channelService.reload()` and `cronSchedulerService?.reload()` to keep runtime in sync.

## Built-in Agent Protection

The default built-in agent is marked with `BUILT_IN_DEFAULT_AGENT_MCP_KEY = '__tiaBuiltInDefaultAgent'` in its `mcpConfig`. The claws route:

- Filters it from GET listings
- Rejects PATCH/DELETE operations on it

## UI Structure

### ClawsPage

- Shows onboarding card when no claws exist
- Displays a 2-column grid of claw cards
- Each card: name, provider, channel status badge, enable/disable toggle, edit/delete buttons

### ClawEditorDialog

- Modal form for create and edit flows
- Fields: name, provider (dropdown), instructions, enabled checkbox
- Channel action dropdown (edit mode): keep / create / attach / detach
- Inline Lark fields when creating a channel: name, appId, appSecret

## Channel Abstraction Layer

### Key Files

| File | Description |
|------|-------------|
| `src/main/channels/types.ts` | `ChannelAdapter` interface |
| `src/main/channels/abstract-channel.ts` | Base class with shared behavior |
| `src/main/channels/lark-channel.ts` | Lark implementation |

### Message Acknowledgment

`ChannelAdapter` defines an optional `acknowledgeMessage?(messageId: string): Promise<void>` method. When implemented, `AbstractChannel.emitMessage()` automatically calls it (fire-and-forget) before forwarding the message for AI processing. This provides instant user feedback that the message was received.

Concrete implementations:

- **Lark**: Sends a "Get" emoji reaction via `client.im.v1.messageReaction.create()`
- **Future channels** (e.g., Telegram): Override `acknowledgeMessage` with their own acknowledgment API

Failures in `acknowledgeMessage` are silently caught and never block message processing.

## Key Design Decisions

1. **No separate `claw` table** — claws are composed views of assistant + channel
2. **Assistant-driven activation** — `enabled` is on assistant, not channel
3. **One channel per assistant** — each assistant binds to at most one channel
4. **Unbound channels are reusable** — deleting an assistant leaves its channel available
5. **Built-in protection** — default agent is server-side filtered, never deletable via claws
6. **Service reload on mutation** — every API change triggers runtime refresh
