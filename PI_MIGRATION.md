# PI_MIGRATION.md

> Migration plan for adopting **Pi Coding Agent** as the primary coding-agent harness in the desktop application.
>
> **Status:** Ready for implementation  
> **Last verified:** 2026-07-16  
> **Primary target:** Electron + React + assistant-ui  
> **Default Pi integration:** `pi --mode rpc` subprocess managed by the Electron main process  
> **Experimental alternative:** Direct `AgentSessionRuntime` SDK integration  
> **AI SDK v7 HarnessAgent:** Optional compatibility adapter only; not the core application boundary

---

## 1. Mission

Replace the current agent execution path with Pi while preserving the existing desktop chat experience and creating a stable application-owned agent abstraction.

The migration must support:

- Long-running coding-agent sessions.
- Streaming assistant text and reasoning.
- Streaming tool execution and tool results.
- Multiple conversations and workspaces.
- Session persistence, resumption, branching, and recovery.
- Sending steering instructions while the agent is active.
- Queuing follow-up instructions.
- Cancellation and process termination.
- Model and thinking-level selection.
- Pi extensions, skills, prompt templates, and project context files.
- Permission prompts and other extension-driven user interactions.
- A future remote-agent implementation without rewriting the UI.
- An optional future AI SDK HarnessAgent adapter without adopting its storage or UI schemas.

The migration is complete only when Pi can perform a real multi-step repository task through the desktop UI, survive navigation between threads, resume after application restart, and correctly render every tool lifecycle state.

---

## 2. Core architectural decision

The application owns its own runtime contract and event schema.

Neither Pi types, AI SDK message types, nor assistant-ui message types may become the canonical persisted application schema.

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron renderer                                           │
│                                                             │
│ React + assistant-ui                                        │
│        │                                                    │
│        ▼                                                    │
│ Application chat/session store                              │
│        │                                                    │
│        ▼                                                    │
│ Stable AppAgentRuntime client                               │
└────────┬────────────────────────────────────────────────────┘
         │ typed Electron IPC
┌────────▼────────────────────────────────────────────────────┐
│ Electron main process                                       │
│                                                             │
│ AgentRuntimeManager                                         │
│        │                                                    │
│        ├── PiRpcRuntime             production default      │
│        ├── PiSdkRuntime             experimental spike      │
│        └── AiSdkHarnessRuntime      future/optional         │
│                                                             │
│ Session index + process supervision + credential boundary   │
└────────┬────────────────────────────────────────────────────┘
         │ stdin/stdout JSONL
┌────────▼────────────────────────────────────────────────────┐
│ Bundled or managed Pi process                               │
│                                                             │
│ pi --mode rpc --session-dir <app-data/session-dir>          │
│                                                             │
│ Workspace filesystem, tools, extensions, skills, models     │
└─────────────────────────────────────────────────────────────┘
```

### Why the application-owned boundary is mandatory

Pi, assistant-ui, and AI SDK are all evolving independently. A stable internal boundary allows each integration to change without rewriting:

- The renderer.
- Stored messages.
- Thread navigation.
- Tool rendering.
- Analytics.
- Session metadata.
- Remote synchronization.
- Tests.

### Default implementation choice

Start with `PiRpcRuntime`.

Reasons:

- Pi process failures do not crash the Electron main process.
- Runtime startup, shutdown, and forced termination are explicit.
- Pi versions can be pinned and upgraded independently.
- Workspace and environment permissions can be isolated per process.
- The same process protocol can later run locally, in a container, or remotely.
- RPC exposes Pi-specific session, queueing, compaction, retry, and extension UI behavior.

Pi's documentation recommends considering direct `AgentSession` integration for Node.js/TypeScript applications. Therefore, Phase 1 includes a small `PiSdkRuntime` spike. Do not switch the production target unless the direct SDK path clearly wins on packaging, crash isolation, cancellation, and upgrade safety.

---

## 3. Non-goals

Do not perform these changes as part of the initial migration:

- Do not redesign the full chat UI.
- Do not migrate canonical storage to AI SDK UI messages.
- Do not adopt AI SDK HarnessAgent as the primary runtime abstraction.
- Do not implement cloud execution before local Pi execution is stable.
- Do not add a general multi-agent orchestrator.
- Do not build sub-agent behavior unless provided by an explicitly installed Pi extension.
- Do not parse Pi's human-readable terminal output.
- Do not let the renderer spawn Pi or access provider credentials directly.
- Do not use Node's `readline` module to parse Pi RPC output.
- Do not depend on undocumented Pi internals when a public SDK or RPC command exists.

---

## 4. Required repository discovery

Before changing code, inspect the repository and document the current state in:

```text
docs/pi-migration/CURRENT_ARCHITECTURE.md
```

The document must identify:

1. Desktop shell and version.
2. Renderer framework and build tool.
3. Existing assistant-ui runtime.
4. Current AI SDK usage.
5. Existing thread/message store.
6. Current persistence mechanism.
7. Existing Electron IPC boundaries.
8. Current agent/backend transport.
9. Terminal and PTY integration, if any.
10. File-diff and code-rendering components.
11. Credential storage.
12. Packaging and auto-update system.
13. Test frameworks.
14. Existing session IDs and database schema.
15. All places importing AI SDK agent or UI types.

Do not delete the old runtime during discovery. Introduce Pi behind a feature flag first.

Suggested feature flags:

```ts
type AgentBackend = "legacy" | "pi-rpc" | "pi-sdk" | "ai-sdk-harness";

interface AgentFeatureFlags {
  backend: AgentBackend;
  enablePiExtensionUi: boolean;
  enablePiBranching: boolean;
  enablePiCompactionUi: boolean;
}
```

---

## 5. Proposed package and directory structure

Adapt names to the existing monorepo, but preserve the dependency direction.

```text
apps/
  desktop/
    src/
      main/
        agents/
          AgentRuntimeManager.ts
          ipc/
            registerAgentIpc.ts
          pi/
            PiProcessSupervisor.ts
            PiRpcClient.ts
            PiRpcRuntime.ts
            PiRpcJsonlDecoder.ts
            PiRpcEventMapper.ts
            PiExecutableResolver.ts
            PiEnvironmentBuilder.ts
          pi-sdk/
            PiSdkRuntime.ts
          persistence/
            AgentSessionIndex.ts
            AgentSessionRepository.ts
      preload/
        agentBridge.ts
      renderer/
        agents/
          AgentRuntimeProvider.tsx
          assistant-ui/
            usePiExternalStoreRuntime.ts
            convertAppMessageToAssistantUi.ts
          store/
            agentStore.ts
            selectors.ts
          components/
            AgentThread.tsx
            ToolExecutionPart.tsx
            ThinkingPart.tsx
            PermissionRequest.tsx
            QueueIndicator.tsx
            CompactionIndicator.tsx
            RuntimeErrorBanner.tsx

packages/
  agent-runtime/
    src/
      runtime.ts
      events.ts
      messages.ts
      sessions.ts
      interactions.ts
      errors.ts
      index.ts
```

Dependency rule:

```text
renderer -> packages/agent-runtime
main     -> packages/agent-runtime
Pi code  -> packages/agent-runtime + Pi package/protocol
```

`packages/agent-runtime` must not import Pi, assistant-ui, Electron, or AI SDK.

---

## 6. Stable application runtime contract

Create an application-owned interface similar to the following. Adjust naming to fit the repository, but do not remove the abstraction.

```ts
export type AgentSessionId = string;
export type AgentRunId = string;
export type AgentMessageId = string;
export type AgentToolCallId = string;

export interface CreateAgentSessionInput {
  workspacePath: string;
  title?: string;
  provider?: string;
  modelId?: string;
  thinkingLevel?: AgentThinkingLevel;
  parentSessionId?: AgentSessionId;
}

export interface ResumeAgentSessionInput {
  sessionId: AgentSessionId;
}

export interface SendAgentMessageInput {
  sessionId: AgentSessionId;
  text: string;
  attachments?: AgentAttachment[];
  behavior?: "normal" | "steer" | "follow-up";
}

export interface AppAgentRuntime {
  createSession(
    input: CreateAgentSessionInput,
  ): Promise<AgentSessionSnapshot>;

  resumeSession(
    input: ResumeAgentSessionInput,
  ): Promise<AgentSessionSnapshot>;

  closeSession(sessionId: AgentSessionId): Promise<void>;

  sendMessage(input: SendAgentMessageInput): Promise<AgentCommandReceipt>;

  cancelRun(sessionId: AgentSessionId): Promise<void>;

  setModel(
    sessionId: AgentSessionId,
    provider: string,
    modelId: string,
  ): Promise<void>;

  setThinkingLevel(
    sessionId: AgentSessionId,
    level: AgentThinkingLevel,
  ): Promise<void>;

  compactSession(
    sessionId: AgentSessionId,
    instructions?: string,
  ): Promise<void>;

  getSession(
    sessionId: AgentSessionId,
  ): Promise<AgentSessionSnapshot>;

  getMessages(
    sessionId: AgentSessionId,
  ): Promise<AppAgentMessage[]>;

  getSessionTree(
    sessionId: AgentSessionId,
  ): Promise<AgentSessionTree>;

  forkSession(
    sessionId: AgentSessionId,
    entryId: string,
  ): Promise<AgentSessionSnapshot>;

  subscribe(
    sessionId: AgentSessionId,
    listener: (event: AppAgentEvent) => void,
  ): () => void;

  respondToInteraction(
    sessionId: AgentSessionId,
    response: AgentInteractionResponse,
  ): Promise<void>;
}
```

### Runtime invariants

- Each runtime event has a stable application event ID.
- Events for a session are delivered in order.
- Duplicate upstream events do not create duplicate messages or tool cards.
- Tool events are correlated by `toolCallId`.
- A renderer reload can reconstruct state from a snapshot plus persisted events.
- A lost IPC subscriber does not terminate the Pi session.
- Closing a UI thread does not automatically kill a running agent.
- Explicit session termination must clean up the associated process.
- A command receipt means accepted or rejected, not necessarily completed.
- Completion is communicated through runtime events.

---

## 7. Canonical event schema

Create a discriminated union owned by the application.

```ts
export type AppAgentEvent =
  | AgentSessionStartedEvent
  | AgentSessionStateChangedEvent
  | AgentRunStartedEvent
  | AgentRunSettledEvent
  | AgentRunFailedEvent
  | AgentTurnStartedEvent
  | AgentTurnEndedEvent
  | AgentMessageStartedEvent
  | AgentTextDeltaEvent
  | AgentThinkingDeltaEvent
  | AgentMessageCompletedEvent
  | AgentToolStartedEvent
  | AgentToolUpdatedEvent
  | AgentToolCompletedEvent
  | AgentQueueChangedEvent
  | AgentCompactionStartedEvent
  | AgentCompactionCompletedEvent
  | AgentRetryStartedEvent
  | AgentRetryCompletedEvent
  | AgentInteractionRequestedEvent
  | AgentInteractionResolvedEvent
  | AgentExtensionErrorEvent
  | AgentRuntimeExitedEvent;
```

Every event must include:

```ts
interface AgentEventBase {
  eventId: string;
  sessionId: AgentSessionId;
  sequence: number;
  timestamp: string;
  source: "pi-rpc" | "pi-sdk" | "legacy" | "ai-sdk-harness";
}
```

Representative event types:

```ts
interface AgentTextDeltaEvent extends AgentEventBase {
  type: "message.text.delta";
  messageId: AgentMessageId;
  contentIndex: number;
  delta: string;
}

interface AgentThinkingDeltaEvent extends AgentEventBase {
  type: "message.thinking.delta";
  messageId: AgentMessageId;
  contentIndex: number;
  delta: string;
}

interface AgentToolStartedEvent extends AgentEventBase {
  type: "tool.started";
  runId?: AgentRunId;
  toolCallId: AgentToolCallId;
  toolName: string;
  input: unknown;
}

interface AgentToolUpdatedEvent extends AgentEventBase {
  type: "tool.updated";
  toolCallId: AgentToolCallId;
  toolName: string;
  accumulatedOutput: unknown;
}

interface AgentToolCompletedEvent extends AgentEventBase {
  type: "tool.completed";
  toolCallId: AgentToolCallId;
  toolName: string;
  output: unknown;
  isError: boolean;
}

interface AgentQueueChangedEvent extends AgentEventBase {
  type: "queue.changed";
  steering: string[];
  followUps: string[];
}
```

### Important Pi mapping behavior

Pi can emit multiple assistant message boundaries in one overall run, especially around thinking and tools. Do not assume one user message maps to exactly one assistant message.

Maintain an event-mapping state machine per session:

```ts
interface PiMappingState {
  currentRunId?: string;
  currentTurnId?: string;
  currentMessageId?: string;
  contentParts: Map<number, MutableContentPart>;
  activeToolCalls: Map<string, MutableToolCall>;
  lastSequence: number;
}
```

The mapper must:

- Preserve separate text and thinking content parts.
- Append deltas by `contentIndex`.
- Replace tool partial output because Pi tool update payloads are accumulated output, not deltas.
- Complete tools even when the final result is an error.
- Tolerate a missing optional start event by creating a recoverable placeholder.
- Log protocol violations without crashing the entire application.
- Never expose raw provider secrets in logs.

---

## 8. Pi RPC client requirements

Implement a typed `PiRpcClient` in the Electron main process.

### Process startup

Conceptual command:

```bash
pi \
  --mode rpc \
  --session-dir "<application-data>/pi-sessions" \
  --name "<thread-title>"
```

Optional startup arguments include provider and model when configured.

Do not construct the command as one shell string. Spawn the executable with an argument array.

```ts
spawn(piExecutable, args, {
  cwd: workspacePath,
  env: sanitizedEnvironment,
  stdio: ["pipe", "pipe", "pipe"],
  shell: false,
});
```

### Strict JSONL parsing

Pi RPC uses line-feed-delimited JSON.

Requirements:

- Split only on byte `0x0A`.
- Strip one trailing carriage return before JSON parsing.
- Preserve Unicode `U+2028` and `U+2029` inside JSON strings.
- Buffer incomplete records across stdout chunks.
- Reject or quarantine records above a configured size limit.
- Do not use Node's `readline` parser.
- Record malformed lines in redacted diagnostic logs.
- Never merge stderr into stdout.
- Treat stdout as protocol traffic only.

Skeleton:

```ts
export class PiRpcJsonlDecoder {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): string[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    const records: string[] = [];
    let start = 0;

    for (let index = 0; index < this.buffer.length; index += 1) {
      if (this.buffer[index] !== 0x0a) continue;

      let record = this.buffer.subarray(start, index);
      if (record.at(-1) === 0x0d) {
        record = record.subarray(0, record.length - 1);
      }

      if (record.length > 0) {
        records.push(record.toString("utf8"));
      }

      start = index + 1;
    }

    this.buffer = this.buffer.subarray(start);
    return records;
  }
}
```

Add tests for:

- Multiple records in one chunk.
- One record across many chunks.
- CRLF input.
- Embedded `U+2028`.
- Embedded `U+2029`.
- UTF-8 characters split across chunks.
- Empty lines.
- Malformed JSON.
- Oversized records.
- Process exit with an incomplete final record.

### Command correlation

Every command must receive an application-generated ID.

```ts
interface PendingCommand {
  resolve(value: PiRpcResponse): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}
```

Maintain:

```ts
Map<string, PendingCommand>
```

A response resolves the matching command. Events are emitted independently.

Do not equate a successful `prompt` response with run completion. It only confirms that the prompt was accepted, queued, or handled.

### Required commands for initial release

Implement and type:

- `prompt`
- `abort`
- `get_state`
- `get_messages`
- `get_available_models`
- `set_model`
- Thinking-level get/set or cycle commands exposed by the installed Pi version.
- `set_steering_mode`
- `set_follow_up_mode`
- `compact`
- `abort_compaction`
- `get_session_stats`
- `get_entries`
- `get_tree`
- `set_session_name`
- Session switching/resume commands required by the current Pi protocol.
- Fork and tree-navigation commands required by the current Pi protocol.
- Extension UI response commands.

Do not guess command payloads. Generate or validate types against the pinned Pi version and its official RPC documentation/source.

### Required events for initial release

Handle:

- `agent_start`
- `agent_end`
- `agent_settled`
- `turn_start`
- `turn_end`
- `message_start`
- `message_update`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `queue_update`
- `compaction_start`
- `compaction_end`
- `auto_retry_start`
- `auto_retry_end`
- `extension_error`
- Extension UI requests.

Unknown events must be:

1. Safely parsed.
2. Recorded as diagnostics.
3. Forward-compatible.
4. Ignored without terminating the session unless they make state reconstruction impossible.

---

## 9. Process supervision

Create one logical runtime instance per active Pi session.

A single process may own one current session. Do not multiplex unrelated active sessions through one Pi process unless the protocol and lifecycle are proven safe.

`PiProcessSupervisor` responsibilities:

- Resolve and validate the Pi executable.
- Start Pi with the correct workspace and session directory.
- Track PID, session ID, workspace, start time, and health.
- Restart or recover a session after an unexpected process exit.
- Gracefully abort active work before shutdown.
- Escalate from graceful shutdown to process termination.
- Remove listeners and reject pending commands on exit.
- Apply maximum restart limits.
- Surface crashes to the renderer.
- Avoid restart loops caused by bad configuration.
- Capture redacted stderr diagnostics.
- Close all children on app quit.

Suggested lifecycle:

```text
starting
  -> ready
  -> running
  -> ready
  -> stopping
  -> stopped

starting/running/ready
  -> crashed
  -> recovering
  -> ready | failed
```

### Recovery policy

On unexpected exit:

1. Mark the runtime disconnected.
2. Preserve the current UI state.
3. Reject pending command promises with a typed transient error.
4. Attempt one automatic restart when safe.
5. Reopen the persisted Pi session.
6. Fetch state, messages, and entries.
7. Reconcile the reconstructed snapshot with local state.
8. Emit a recovery event.
9. Require manual retry after the configured restart limit.

Never silently resend the last user prompt after a crash. The previous prompt may already have modified files.

---

## 10. Session persistence and indexing

Pi session JSONL files remain the source of truth for Pi's agent history.

The application maintains a separate metadata index for fast UI access.

Suggested metadata:

```ts
interface AgentSessionRecord {
  id: string;
  backend: "pi-rpc" | "pi-sdk" | "legacy" | "ai-sdk-harness";
  upstreamSessionId?: string;
  upstreamSessionFile?: string;
  workspacePath: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  status: "idle" | "running" | "error" | "archived";
  modelProvider?: string;
  modelId?: string;
  thinkingLevel?: string;
  leafEntryId?: string;
  lastSeenEntryId?: string;
  runtimeVersion?: string;
}
```

### Persistence rules

- Do not rewrite Pi session files.
- Do not store provider API keys in session metadata.
- Store paths in a platform-safe form.
- Detect missing or moved workspaces.
- Treat Pi entry IDs as durable cursors where supported.
- Use `get_entries({ since })` to incrementally reconcile after reconnect when supported by the pinned Pi version.
- Use `get_tree` for branch visualization.
- Store only enough normalized message state to render quickly; Pi remains the recoverable source.
- Include a schema version for all application-owned records.

### Existing thread migration

For legacy threads:

- Preserve them unchanged.
- Mark their backend as `legacy`.
- New threads default to `pi-rpc` when the feature flag is enabled.
- Do not attempt to translate an in-progress legacy agent run into Pi.
- Optionally support “Continue with Pi” by creating a new Pi session with an explicit summary and a backlink to the source thread.
- Never pretend that a newly summarized Pi session is the same execution history.

---

## 11. Electron IPC boundary

The renderer must access agents through a narrow preload bridge.

Example renderer-facing API:

```ts
export interface AgentDesktopBridge {
  createSession(input: CreateAgentSessionInput): Promise<AgentSessionSnapshot>;
  resumeSession(input: ResumeAgentSessionInput): Promise<AgentSessionSnapshot>;
  sendMessage(input: SendAgentMessageInput): Promise<AgentCommandReceipt>;
  cancelRun(sessionId: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<AgentSessionSnapshot>;
  getMessages(sessionId: string): Promise<AppAgentMessage[]>;
  setModel(sessionId: string, provider: string, modelId: string): Promise<void>;
  setThinkingLevel(sessionId: string, level: AgentThinkingLevel): Promise<void>;
  respondToInteraction(
    sessionId: string,
    response: AgentInteractionResponse,
  ): Promise<void>;
  subscribe(
    sessionId: string,
    callback: (event: AppAgentEvent) => void,
  ): () => void;
}
```

Security requirements:

- Validate every IPC payload at runtime.
- Verify that the requested workspace is authorized.
- Do not expose arbitrary process-spawn APIs.
- Do not expose arbitrary filesystem APIs through this bridge.
- Scope event subscriptions to the requesting renderer.
- Remove subscriptions when a renderer is destroyed.
- Keep all provider credentials in the main process.
- Redact sensitive fields before crossing IPC when not required by the UI.

Use a schema validator already present in the repository. If none exists, introduce Zod or an equivalent runtime validator in the shared contract package.

---

## 12. Renderer state model

Use Zustand, Jotai, Redux, or the existing application store. The canonical renderer state should remain application-owned.

Suggested state:

```ts
interface AgentUiState {
  sessions: Record<string, AgentSessionViewModel>;
  activeSessionId?: string;
}

interface AgentSessionViewModel {
  snapshot: AgentSessionSnapshot;
  messages: AppAgentMessage[];
  toolCalls: Record<string, AgentToolViewModel>;
  pendingInteraction?: AgentInteractionRequest;
  queue: {
    steering: string[];
    followUps: string[];
  };
  compaction?: {
    active: boolean;
    reason?: string;
  };
  retry?: {
    active: boolean;
    attempt?: number;
    error?: string;
  };
  connection: "connecting" | "connected" | "recovering" | "disconnected";
}
```

Event reducers must be:

- Pure.
- Idempotent by `eventId`.
- Ordered by `sequence`.
- Covered by unit tests.
- Able to rebuild the same view model from a saved event fixture.

Do not mutate assistant-ui state directly from Pi events. First update the application store; then derive assistant-ui messages.

---

## 13. assistant-ui integration

Use `useExternalStoreRuntime` because the application owns messages, persistence, and synchronization.

Conceptual provider:

```tsx
export function AgentRuntimeProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: React.ReactNode;
}) {
  const session = useAgentSessionView(sessionId);
  const actions = useAgentSessionActions(sessionId);

  const runtime = useExternalStoreRuntime({
    isRunning: session.snapshot.status === "running",
    messages: session.messages,
    convertMessage: convertAppMessageToAssistantUi,
    onNew: async (message) => {
      const text = extractText(message);
      await actions.send(text, "normal");
    },
    onCancel: async () => {
      await actions.cancel();
    },
    onAddToolResult: async (result) => {
      await actions.resolveToolOrInteraction(result);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

Use the exact callbacks supported by the installed assistant-ui version. Do not copy this conceptual sample without checking current types.

### Message conversion

Convert application messages into assistant-ui content parts:

- User text -> text part.
- Assistant text -> text part.
- Thinking -> custom collapsible reasoning part or supported reasoning part.
- Tool call -> tool-call part with stable `toolCallId`.
- Tool result -> paired tool-result rendering.
- Image attachment -> image/file part.
- Runtime notice -> custom system/status component, not fabricated assistant text.
- Permission request -> interactive component associated with an application interaction ID.

Preserve Pi message and entry IDs in message metadata or external-store bindings when possible.

### Required chat behavior

- Streaming text updates in place.
- Streaming tool output replaces accumulated output in place.
- Switching threads does not stop an active run.
- Returning to a running thread shows its current live state.
- Composer displays whether a new message will steer, follow up, or be rejected.
- Cancel button aborts the current Pi operation.
- Tool cards survive reload.
- Failed tools remain visible.
- Thinking can be collapsed.
- Compaction and retry states are visible but unobtrusive.
- Extension errors are surfaced without crashing the thread.
- Unknown tool types use a safe generic renderer.

---

## 14. Steering and follow-up UX

Pi differentiates steering from follow-up messages while streaming.

Implement explicit behavior:

### Normal

Used when the agent is idle.

```ts
behavior: "normal"
```

### Steer

Delivered after the current assistant turn finishes its active tool calls and before the next model call.

Use for:

- “Stop using that approach.”
- “Focus on the API package.”
- “Do not change the database schema.”

### Follow-up

Delivered after the agent fully settles.

Use for:

- “After that, run the full test suite.”
- “Then summarize the changes.”

### UI requirements

When a session is running, the composer should offer:

- **Steer current run**
- **Queue after completion**

Choose a sensible default, but make the behavior visible. Do not send a plain prompt without a streaming behavior while Pi is already running.

Render pending queue contents from Pi `queue_update` events rather than assuming that a locally submitted queue operation succeeded.

---

## 15. Extension UI and permissions

Pi extensions can request UI input such as confirmation, selection, text input, or notification.

Create application-level interaction types:

```ts
type AgentInteractionRequest =
  | AgentConfirmRequest
  | AgentSelectRequest
  | AgentTextInputRequest
  | AgentNotificationRequest
  | AgentCustomInteractionRequest;
```

Initial release must support:

- Confirm.
- Select.
- Text input.
- Notification.

For unsupported custom UI:

- Show a clear unsupported-interaction card.
- Include safe descriptive metadata.
- Allow cancellation when the protocol permits.
- Do not auto-approve.

### Permission policy

Implement a host-level policy before production release:

- Read-only operations may be auto-approved according to workspace policy.
- File writes should be visible in tool rendering.
- Shell commands matching risky patterns require confirmation.
- Commands involving credential files, destructive deletion, privilege escalation, or writes outside the workspace require confirmation or blocking.
- Permission decisions must be scoped and auditable.
- “Always allow” decisions must identify exact scope and be revocable.
- Never allow the model to directly change the application's permission policy.

Pi extensions may also implement their own gates. Host policy remains the outer boundary.

---

## 16. Credentials and provider configuration

Provider credentials must remain outside the renderer.

Requirements:

- Use the existing secure credential store.
- Inject only the environment variables needed by the selected provider.
- Do not pass the renderer's entire environment to Pi.
- Redact secrets from stderr, diagnostics, telemetry, and crash reports.
- Support Pi's configured model registry where appropriate.
- Detect missing credentials before accepting a run when possible.
- Present actionable setup errors.
- Keep authentication management independent from the chat UI.
- Do not write raw API keys into project-local `.pi` files.

Create:

```ts
interface PiEnvironmentBuilder {
  build(input: {
    provider?: string;
    baseEnvironment: NodeJS.ProcessEnv;
  }): Promise<NodeJS.ProcessEnv>;
}
```

Start from a minimal allowlist rather than blindly cloning `process.env`.

---

## 17. Pi executable packaging

Implement an executable resolution strategy with diagnostics.

Possible strategies:

1. Bundle a pinned Pi package/version with the desktop application.
2. Run Pi through a bundled Node entry point.
3. Use a managed application-specific installation.
4. Permit a user-selected external Pi executable for development only.

Production preference:

- Pin a tested Pi version.
- Avoid depending on a globally installed `pi`.
- Verify the resolved executable or entry point at startup.
- Record the Pi version in session metadata.
- Keep upgrade logic explicit.
- Provide a rollback path when a Pi upgrade changes behavior.

The executable resolver must report:

- Resolved path.
- Version.
- Source: bundled, managed, or external.
- Compatibility result.
- Missing runtime dependencies.
- Whether the binary is trusted for production use.

Do not download and execute code silently at runtime.

---

## 18. Direct SDK spike

Build a narrow `PiSdkRuntime` spike after the RPC client contract is stable.

Use current public Pi APIs such as:

- `createAgentSessionRuntime`
- `AgentSessionRuntime`
- `AgentSession`
- Session subscriptions
- `prompt`
- `steer`
- `followUp`
- `abort`
- Session replacement APIs

The spike must run in the Electron main process, never the renderer.

Evaluate:

| Criterion | Pi RPC | Pi SDK |
|---|---:|---:|
| Crash isolation | Strong | Weak |
| Forced termination | Strong | Limited |
| API typing | Protocol types/manual | Strong |
| Startup overhead | Higher | Lower |
| Packaging complexity | Process/binary | Node dependency |
| Pi version isolation | Strong | Coupled to app |
| Debugging | Process logs | In-process stack |
| Remote execution path | Natural | Requires wrapper |
| Session replacement | RPC commands | Runtime API |
| Extension support | Protocol-dependent | Native |

Write findings to:

```text
docs/pi-migration/PI_SDK_SPIKE.md
```

Keep `PiRpcRuntime` as production default unless the direct SDK implementation demonstrates:

- Reliable cancellation.
- Safe app shutdown.
- No Electron main-process instability.
- Equivalent extension and session behavior.
- Easier packaging with no significant upgrade coupling.
- A credible worker-thread or child-process isolation story.

Do not maintain two production implementations indefinitely. The spike exists to validate the decision.

---

## 19. AI SDK v7 HarnessAgent policy

AI SDK v7 supports established harness adapters, including Pi, but this integration remains an optional compatibility layer.

Rules:

- Do not persist `HarnessAgent` session objects.
- Do not use AI SDK harness event types as canonical application events.
- Do not make assistant-ui depend directly on the harness adapter.
- Do not block the Pi migration on AI SDK harness maturity.
- Add the adapter only after `AppAgentRuntime` is production-ready.
- Treat AI SDK harness package upgrades as independent integration work.
- Keep package versions pinned.
- Add adapter contract tests using the same runtime conformance suite.

Potential future implementation:

```text
AiSdkHarnessRuntime
  -> implements AppAgentRuntime
  -> maps HarnessAgent events to AppAgentEvent
  -> can be enabled by feature flag
```

This permits future interoperability without coupling the main product to an alpha or fast-changing abstraction.

---

## 20. Testing strategy

### Unit tests

Required:

- Strict JSONL decoder.
- RPC request/response correlation.
- Command timeout.
- Process-exit rejection.
- Pi event mapper.
- Text streaming reducer.
- Thinking streaming reducer.
- Tool partial-output replacement.
- Tool completion and errors.
- Queue updates.
- Compaction events.
- Retry events.
- Unknown event handling.
- IPC schema validation.
- assistant-ui message conversion.
- Session reconciliation.
- Duplicate-event idempotency.

### Protocol fixture tests

Capture sanitized Pi event streams as fixtures.

Include:

1. Text-only response.
2. Thinking plus text.
3. One tool call.
4. Parallel tool calls.
5. Streaming bash output.
6. Tool error.
7. Steering instruction.
8. Follow-up queue.
9. Automatic retry.
10. Automatic compaction.
11. Manual compaction.
12. Extension confirmation.
13. Process crash.
14. Resume after restart.
15. Branch/fork navigation.
16. Unknown future event.

Replay each fixture through the mapper and assert the final application state.

### Runtime contract tests

Create a shared conformance suite:

```ts
export function runAgentRuntimeContract(
  createRuntime: () => Promise<AppAgentRuntime>,
): void;
```

Run it against:

- Fake runtime.
- `PiRpcRuntime`.
- `PiSdkRuntime` spike.
- Future AI SDK harness runtime.

### Integration tests

Use a temporary repository and a deterministic or low-cost test model where feasible.

Test:

- Create a file.
- Edit a file.
- Run a command.
- Stream output.
- Cancel a long command.
- Resume after app restart.
- Switch away from and back to a running thread.
- Fork from an earlier message.
- Handle a permission prompt.
- Recover from a killed Pi process.
- Preserve session history.

### Desktop end-to-end tests

At minimum:

- Start application with Pi backend enabled.
- Open a workspace.
- Create a Pi thread.
- Send a prompt.
- Observe streaming text.
- Observe a tool card.
- Navigate to another thread.
- Return and see correct state.
- Restart the application.
- Resume the thread.
- Cancel an active run.
- Resolve a permission prompt.

---

## 21. Observability

Add structured, redacted logging.

Recommended fields:

```ts
{
  component,
  backend,
  sessionId,
  upstreamSessionId,
  commandId,
  eventType,
  toolCallId,
  processId,
  durationMs,
  success,
  errorCode
}
```

Never log by default:

- API keys.
- Authorization headers.
- Full environment variables.
- Full file contents.
- Raw image attachments.
- User secrets.
- Unredacted shell output that may contain secrets.

Metrics to track:

- Pi startup duration.
- Prompt acceptance latency.
- First text delta latency.
- Tool duration.
- Run duration.
- Cancellation latency.
- Process crash rate.
- Recovery success rate.
- JSON parse failure count.
- Unknown event count.
- Session-resume duration.
- Event backlog size.
- Renderer reconciliation duration.

---

## 22. Migration phases

### Phase 0 — Discovery and safety net

Deliverables:

- `CURRENT_ARCHITECTURE.md`
- Dependency map.
- Existing agent flow diagram.
- Feature flag.
- Baseline tests for current chat behavior.
- List of affected files.

Exit criteria:

- Legacy runtime still works.
- Pi code is not yet active.
- Current thread persistence behavior is documented.

### Phase 1 — Runtime contracts and Pi transport

Deliverables:

- `packages/agent-runtime`.
- Stable runtime interfaces.
- Canonical event types.
- `PiRpcJsonlDecoder`.
- `PiRpcClient`.
- `PiProcessSupervisor`.
- Protocol fixture tests.
- Minimal Pi launch and `get_state`.

Exit criteria:

- A test can launch Pi, send a prompt, receive events, and shut down.
- No renderer integration is required yet.
- Malformed protocol data cannot crash the desktop app.

### Phase 2 — Event mapping and persistence

Deliverables:

- `PiRpcEventMapper`.
- Session metadata repository.
- Message/state reconciliation.
- Resume support.
- Crash recovery.
- Event reducer tests.

Exit criteria:

- A text-and-tool Pi run reconstructs correctly from fixtures.
- A persisted session can reopen after process restart.
- Duplicate events do not duplicate UI state.

### Phase 3 — Electron IPC

Deliverables:

- Main-process runtime manager.
- Preload bridge.
- Runtime validation schemas.
- Subscription lifecycle handling.
- Credential/environment boundary.

Exit criteria:

- Renderer can create, resume, prompt, cancel, and subscribe.
- Renderer never receives credentials or a raw process handle.
- Invalid IPC payloads are rejected safely.

### Phase 4 — assistant-ui integration

Deliverables:

- External-store runtime provider.
- Application-to-assistant-ui message conversion.
- Streaming text.
- Thinking rendering.
- Generic and specialized tool cards.
- Error, retry, and compaction indicators.
- Thread switching behavior.

Exit criteria:

- A real Pi coding task works through the desktop UI.
- Tool output streams in place.
- Switching threads does not stop the run.
- Returning to the thread shows current state.

### Phase 5 — Pi-native behavior

Deliverables:

- Steering UX.
- Follow-up UX.
- Model selector.
- Thinking selector.
- Session stats.
- Branch/fork UI.
- Extension UI requests.
- Permission policy.

Exit criteria:

- Pi-specific capabilities are usable without falling back to a terminal.
- The user can resolve extension prompts.
- Branching and resume are correct.

### Phase 6 — Packaging and reliability

Deliverables:

- Pinned Pi packaging.
- Version compatibility check.
- App shutdown cleanup.
- Process recovery.
- Redacted diagnostics.
- End-to-end tests.
- Migration documentation.

Exit criteria:

- Packaged macOS build runs Pi without a global installation.
- Windows support is tested if Windows is an active target.
- No orphan Pi processes remain after app exit.
- Unexpected process termination is recoverable.

### Phase 7 — SDK comparison and cleanup

Deliverables:

- `PI_SDK_SPIKE.md`
- Runtime comparison.
- Production-path decision.
- Remove dead experimental code.
- Deprecation plan for the legacy runtime.

Exit criteria:

- One Pi production path is selected.
- Legacy runtime removal is separately approved.
- AI SDK harness remains optional and isolated.

---

## 23. Definition of done

All items must be true:

- [ ] Pi is the default backend behind a feature flag or release channel.
- [ ] The renderer uses the application-owned runtime contract.
- [ ] assistant-ui is fed from the application store via an external-store runtime.
- [ ] Pi runs outside the renderer.
- [ ] Pi RPC uses strict LF JSONL parsing.
- [ ] Text, thinking, tools, retries, compaction, and queue events render correctly.
- [ ] Tool updates replace accumulated output instead of appending duplicates.
- [ ] Steering and follow-up messages work during active runs.
- [ ] Cancellation works and has a forced-termination fallback.
- [ ] Thread navigation does not stop active runs.
- [ ] Sessions resume after desktop restart.
- [ ] Crash recovery does not silently replay prompts.
- [ ] Session trees and forks are supported or explicitly feature-gated.
- [ ] Extension confirmation/select/input requests work.
- [ ] Credentials never enter the renderer.
- [ ] Pi is pinned and packaged reproducibly.
- [ ] Unknown Pi events do not crash the application.
- [ ] Existing legacy threads remain readable.
- [ ] Runtime contract, integration, and desktop E2E tests pass.
- [ ] Documentation explains how to update Pi safely.
- [ ] No unfinished migration TODO is left without an owner or tracked issue.

---

## 24. Codex execution contract

Codex must follow these rules while implementing this migration:

1. Read this file completely before editing.
2. Inspect the repository and write `CURRENT_ARCHITECTURE.md`.
3. Create or update a checklist in `TASKS.md` matching the phases in this document.
4. Work phase by phase in dependency order.
5. Continue until every currently unblocked task is complete.
6. Do not stop merely after scaffolding interfaces.
7. Do not claim completion while tests, types, lint, or build are failing.
8. Run the narrowest relevant tests after each meaningful change.
9. Run the full required validation before completing a phase.
10. Preserve the legacy path behind a feature flag until Pi passes end-to-end tests.
11. Prefer small, reviewable commits or change groups.
12. Document any material deviation from this design in:
    `docs/pi-migration/DECISIONS.md`.
13. Do not invent Pi RPC commands or event payloads. Check the pinned package source and official documentation.
14. Do not use undocumented assistant-ui APIs without isolating them behind an adapter.
15. Do not couple persistence to Pi, assistant-ui, or AI SDK types.
16. Do not leave placeholder implementations that return fabricated success.
17. When blocked by an external dependency, finish all other unblocked work and record:
    - Exact blocker.
    - Reproduction.
    - Affected phase.
    - Workaround considered.
    - Recommended next action.
18. At the end, provide:
    - Files changed.
    - Architecture summary.
    - Tests run and results.
    - Known limitations.
    - Remaining tracked work.
    - Manual verification steps.

### Required validation commands

Codex must discover the repository's actual scripts and use them. The final validation should include the equivalents of:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Also run the desktop end-to-end suite when one exists.

Do not add `|| true`, disable tests, weaken type checking, or suppress errors merely to make validation appear successful.

---

## 25. Initial implementation prompt for Codex

Use this after placing the file at the repository root:

```text
Implement the Pi migration described in PI_MIGRATION.md.

Start by reading the entire document and inspecting the repository. Create
docs/pi-migration/CURRENT_ARCHITECTURE.md and update TASKS.md with every phase,
deliverable, and acceptance criterion.

Then implement all currently unblocked phases in order. Preserve the existing
agent path behind a feature flag until the Pi path passes end-to-end tests.

The application must own its runtime contract and canonical event schema.
Do not make Pi, assistant-ui, or AI SDK types the persisted domain model.
Use Pi RPC as the initial production implementation, with strict LF-delimited
JSONL parsing and process supervision in the Electron main process.

Do not stop after scaffolding. Continue through working integration, tests,
typecheck, lint, and build. When an external blocker prevents a task, document
the exact blocker and continue every other unblocked task.

At completion, report files changed, architecture, tests, limitations, and
manual verification steps.
```

---

## 26. Primary references

Verify APIs against the installed/pinned versions during implementation.

- Pi documentation: <https://pi.dev/docs/latest>
- Pi RPC mode: <https://pi.dev/docs/latest/rpc>
- Pi SDK: <https://pi.dev/docs/latest/sdk>
- Pi extensions: <https://pi.dev/docs/latest/extensions>
- Pi repository: <https://github.com/earendil-works/pi>
- assistant-ui ExternalStoreRuntime:
  <https://www.assistant-ui.com/docs/runtimes/custom/external-store>
- assistant-ui custom runtime overview:
  <https://www.assistant-ui.com/docs/runtimes/custom/overview>
- AI SDK v7 harness overview:
  <https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/overview>
- Vercel AI repository:
  <https://github.com/vercel/ai>

---

## 27. Final design principle

Pi is the execution harness, not the product's permanent data model.

The desktop application must preserve a clean boundary:

```text
Pi behavior
    ↓
Pi adapter
    ↓
Application runtime contract
    ↓
Application session and message state
    ↓
assistant-ui presentation
```

Maintaining this boundary is more important than minimizing the first implementation's file count. It is what allows Pi, assistant-ui, Electron, or AI SDK to evolve without forcing another full migration.
