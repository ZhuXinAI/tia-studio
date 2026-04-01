# CLAW in TIA Studio (Legacy Term)

`CLAW` is the legacy term for what the product now calls a **Channel Binding**: an assistant connected to a real-world channel.

The implementation is intentionally simple: a channel binding is not a separate runtime type. It is a normal assistant record plus a channel attachment, with Mastra powering the assistant side of the system and channel adapters handling transport on the outside.

## The core idea

TIA Studio does **not** create a dedicated `claws` table (or `channel_bindings` table) or a second identity model.

Instead, it keeps the system assistant-first:

- the assistant still owns instructions, provider choice, workspace, tools, memory, cron jobs, and heartbeat behavior,
- the channel only owns transport concerns such as credentials, adapter startup, remote chat identifiers, and delivery state,
- the Channel Bindings UI is a management surface that helps users create and maintain that pairing.

This gives the app one consistent identity model. The same assistant can chat in the desktop UI, run scheduled jobs, write work logs, and speak in a channel without being duplicated into a separate “claw runtime”.

## The building blocks

At a high level, a channel binding is assembled from five pieces:

1. **Assistant record** — stored in `app_assistants`, including the `enabled` flag and the assistant’s Mastra-facing configuration.
2. **Channel record** — stored in `app_channels`, including credentials, channel type, last error state, and the `assistantId` link.
3. **Claws API (compatibility route)** — the HTTP layer that creates, updates, lists, and deletes assistant-plus-channel combinations.
4. **Channel runtime** — adapters such as Lark and Telegram that connect TIA Studio to external conversations.
5. **Mastra runtime** — the assistant execution layer that turns a stored assistant definition into an active agent with memory, tools, workspace access, and streaming replies.

That split lets each part do one job well:

- persistence keeps state durable,
- routes coordinate mutations,
- channel services manage live adapters,
- Mastra runs the actual assistant behavior.

## Why Mastra is the center of the assistant side

Mastra is the runtime that turns a stored assistant configuration into something that can think, use tools, stream responses, and remember context.

In TIA Studio, that role shows up in a few important ways:

### 1. A shared Mastra instance

The app creates one Mastra instance backed by a LibSQL store. That gives the runtime a durable storage layer that lives alongside the rest of the desktop app’s data.

This is why the assistant experience feels consistent whether the assistant is replying in the desktop chat UI or through a channel: both flows are built on the same underlying runtime.

### 2. Agents are registered from assistant records

TIA Studio does not hardcode every assistant as a source file. Instead, `AssistantRuntimeService` reads an assistant record, resolves its provider, workspace, MCP configuration, and tool set, and then registers the corresponding Mastra agent on demand.

That means a claw does not get a separate “channel agent”. The assistant that powers direct chat is the same assistant that powers channel delivery.

### 3. Memory stays attached to assistant threads

When Mastra handles a chat run, TIA Studio passes thread and profile information into the runtime so message history stays attached to the correct assistant conversation.

For a claw, that means channel conversations are still represented as assistant threads. A remote chat is mapped into a local thread, and Mastra continues from there.

### 4. Workspace and tool access remain assistant-owned

If an assistant has a workspace root, TIA Studio builds a Mastra workspace around it and enables local tools such as work logs, soul memory helpers, cron helpers, `webFetch`, and channel-aware tools.

This is a big part of the claw design: channel access is an extra transport capability, not a forked identity. The same assistant can still act inside its own workspace and tool environment.

### 5. MCP servers plug into the same assistant runtime

Enabled MCP servers are resolved from assistant configuration and attached through Mastra’s MCP client support.

That keeps claws consistent with the rest of the system: connecting an assistant to a channel does not bypass MCP or create a separate integration stack.

## How the claws API models a claw

The claws API is the orchestration layer that turns “assistant + channel” into a manageable feature.

The important design choice is that the API still speaks in assistant terms:

- creating a claw creates an assistant and optionally creates or attaches a channel,
- updating a claw updates assistant fields and channel attachment state,
- deleting a claw deletes the assistant while leaving the transport model reusable where appropriate,
- listing claws returns a composed view that is assembled from assistant and channel records.

This keeps the public mental model simple while preserving the internal data model.

If you want the lower-level endpoint and file reference, `docs/claws.md` is still the deeper implementation companion.

## The lifecycle of a claw

The easiest way to understand the implementation is to follow a claw from setup to reply.

### 1. A user configures the claw in the renderer

The React claws feature collects the assistant settings and the chosen channel setup in one place.

From the user’s point of view, they are creating one thing. Under the hood, the app is gathering two kinds of data:

- assistant data such as name, instructions, provider, and enablement,
- channel data such as channel type and credentials.

### 2. The claws route persists the assistant-channel pairing

The main-process server receives the request and coordinates the write:

- it creates or updates the assistant record,
- it creates a channel or attaches an existing unbound one,
- it resolves whether the assistant should be enabled,
- it returns a composed claw-shaped response to the UI.

This is where the assistant-first design becomes real. The “claw” response is assembled for the client, but the database still stores assistants and channels separately.

### 3. Runtime services reload live channel state

After claw mutations, TIA Studio reloads the services that depend on the new attachment state.

That matters because a claw is not just stored data. It is also a live runtime relationship:

- the channel service decides which channel adapters should be running,
- the cron scheduler stays aligned with assistant enablement,
- downstream routing immediately sees the new configuration.

### 4. A channel adapter receives an external message

Once running, a channel adapter such as Lark or Telegram receives events from the external service and publishes them onto TIA Studio’s channel event bus.

This is the boundary between transport and assistant behavior:

- the adapter knows how to speak to the external platform,
- the rest of the app decides what that message means for an assistant thread.

### 5. The channel router resolves the assistant thread

`ChannelMessageRouter` is responsible for turning an inbound channel event into an assistant conversation.

It does a few important things:

- verifies the channel is still runtime-enabled,
- looks up or creates a thread binding for the `(channel, remote chat, assistant)` combination,
- ensures the assistant thread exists locally,
- invokes the assistant runtime with the channel target attached.

This thread binding step is what makes a remote conversation feel continuous across messages.

### 6. Mastra runs the assistant and streams the reply

The assistant runtime then calls Mastra’s chat stream handling with the stored assistant configuration and the resolved thread context.

At that point the claw is just an assistant run with a little extra channel context:

- Mastra handles model execution and memory integration,
- assistant tools remain available,
- channel-aware delivery behavior can be enabled for that run,
- the reply is streamed instead of waiting for a single final blob.

TIA Studio also supports a small channel-splitting convention so one assistant reply can intentionally become multiple outbound channel messages when needed.

### 7. Outbound channel delivery goes back through the event bus

When the assistant has content to send back out, TIA Studio publishes channel send requests and lets the active adapter deliver them to the external service.

That keeps delivery concerns outside the assistant logic:

- Mastra decides what to say,
- the channel layer decides how to send it.

## How assistant identity stays intact

One of the most important architectural choices is that claws do **not** fork assistant identity.

That has several consequences:

### Heartbeat stays assistant-owned

Heartbeat runs are still scheduled and executed as assistant behavior. They can use the assistant workspace, recent conversation context, and work log support without becoming a separate claw-only system.

### Cron stays assistant-owned

Scheduled work still belongs to the assistant, not to the channel. A claw can participate in channel conversations and still run independent scheduled tasks through the same assistant runtime.

### Tools stay assistant-owned

Tools are loaded for the assistant, not for an abstract claw object. Channel messaging tools are additive: they extend the same assistant runtime instead of replacing it.

### Enablement is shared across the relationship

The running channel list is derived from both channel state and assistant state. In practice, that means a claw only runs when the transport is enabled and the attached assistant is enabled.

This shared gating is what lets the app keep channel runtime, cron behavior, and assistant availability aligned.

## Why there is no dedicated `claws` table

Avoiding a dedicated `claws` table keeps the system smaller and more consistent.

If TIA Studio introduced a third identity layer for claws, it would need to answer harder questions:

- Which object owns memory?
- Which object owns workspace files?
- Where do cron jobs belong?
- Which object is the source of truth for provider and instructions?

The current design avoids all of that by keeping the assistant as the source of truth and treating the channel as a transport attachment.

That is the real reason the claw architecture stays manageable as features grow: new behavior can usually be added to assistant runtime, channel transport, or routing without inventing another domain object.

## Files worth reading next

If you want to continue from the explainer into the source, these are the best next stops:

- `src/main/server/routes/claws-route.ts` — claw-oriented API orchestration.
- `src/main/channels/channel-service.ts` — starts and reloads live channel adapters.
- `src/main/channels/channel-message-router.ts` — turns inbound channel events into assistant runs.
- `src/main/mastra/assistant-runtime.ts` — the main Mastra-powered assistant execution layer.
- `src/main/mastra/store.ts` — creates the shared Mastra instance and storage backend.
- `src/main/mastra/tools/channel-tools.ts` — channel-aware tools exposed to assistants.
- `src/main/persistence/repos/assistants-repo.ts` — assistant storage model.
- `src/main/persistence/repos/channels-repo.ts` — channel storage model and runtime-enabled queries.
- `docs/claws.md` — lower-level claw implementation reference.

## The short version

A claw in TIA Studio is best understood as:

> one assistant identity, one optional channel attachment, one Mastra-powered runtime.

That model is what lets the app stay local-first, understandable, and extensible without inventing a separate claw engine.
