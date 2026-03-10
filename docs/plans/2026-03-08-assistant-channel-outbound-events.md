# Assistant Channel Outbound Events Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish `channel.message.send-requested` events from assistant runtime after a channel-targeted streamed reply completes, without implementing transport delivery yet.

**Architecture:** Extend `AssistantRuntimeService` with an optional channel target parameter that can be supplied by future channel routing code. Capture assistant text while draining the Mastra stream wrapper, and publish one outbound event to the shared `ChannelEventBus` after the stream finishes if the reply has non-empty text.

**Tech Stack:** TypeScript, Vitest, Mastra streaming runtime, in-memory channel event bus.

---

### Task 1: Add the outbound runtime red tests

**Files:**

- Modify: `src/main/mastra/assistant-runtime.test.ts`

**Step 1: Write the failing tests**

Add tests for:

- publishing `channel.message.send-requested` when a streamed assistant reply finishes and a channel target is provided
- preserving `channelId`, `channelType`, and `remoteChatId`
- not publishing an event when the captured assistant reply text is empty

**Step 2: Run test to verify it fails**

Run: `npm test -- src/main/mastra/assistant-runtime.test.ts`
Expected: FAIL because runtime does not publish outbound channel events yet.

**Step 3: Write minimal implementation**

- Extend `StreamChatParams` with optional `channelTarget`
- Capture assistant text from streamed chunks in the existing wrapper path
- Publish `channel.message.send-requested` with a text payload after stream completion when text is non-empty
- Keep normal thread sync behavior unchanged

**Step 4: Run test to verify it passes**

Run: `npm test -- src/main/mastra/assistant-runtime.test.ts`
Expected: PASS

### Task 2: Run focused verification

**Files:**

- No code changes expected

**Step 1: Run focused tests**

Run: `npm test -- src/main/channels/channel-event-bus.test.ts src/main/mastra/assistant-runtime.test.ts`
Expected: PASS

**Step 2: Run node typecheck**

Run: `npm run typecheck:node`
Expected: PASS
