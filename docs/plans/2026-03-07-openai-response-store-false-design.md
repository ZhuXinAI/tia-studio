# OpenAI Responses `store: false` Design

**Context**

Second-turn requests sent through `openai.responses()` can fail against some upstream gateways when the SDK compacts prior assistant output into `item_reference` entries. In this codebase, that happens when an assistant or team supervisor uses the `openai-response` provider and the OpenAI Responses API default `store: true` behavior is left enabled.

**Decision**

Use `providerOptions.openai.store = false` for all runtime executions that target the `openai-response` provider.

**Scope**

- Assistant chat runtime in `src/main/mastra/assistant-runtime.ts`
- Team supervisor runtime in `src/main/mastra/team-runtime.ts`
- Regression tests for both runtimes

**Why this approach**

- Prevents AI SDK from emitting `item_reference` payloads for prior stored outputs
- Avoids coupling a thread to a specific `previousResponseId` chain or model family
- Requires no database changes, thread metadata, or renderer changes
- Leaves non-`openai-response` providers untouched

**Non-goals**

- Persisting `previousResponseId`
- Changing chat transport request shapes
- Modifying thread or team-thread database schemas
- Altering Mastra memory behavior for other providers

**Validation**

- Assistant runtime test confirms `handleChatStream` receives `providerOptions.openai.store = false`
- Team runtime test confirms supervisor `stream()` receives `providerOptions.openai.store = false`
- Focused runtime test suite passes
