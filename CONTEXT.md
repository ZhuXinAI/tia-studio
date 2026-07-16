# TIA Studio

TIA Studio is a local-first AI desktop workspace. Its core concepts define how people organize ongoing AI work, configure model behavior, and attach optional operational capabilities.

## Language

**Workspace**:
The primary place where a user organizes AI work. A workspace is a folder-backed container for threads. Its folder path is fixed after creation unless the user explicitly relocates it.
_Avoid_: Team, project shell, mode

**Relocation**:
The explicit repair flow for a workspace whose original folder path is no longer available. Relocation updates the workspace to a new path while preserving its existing threads.
_Avoid_: Rename, automatic path update

**Workspace Deletion**:
Removing a workspace deletes its threads from TIA Studio instead of detaching or archiving them. A deleted workspace does not leave behind a standalone conversation history object.
_Avoid_: Detach workspace, archived shell

**Chats**:
The built-in workspace for ad-hoc and channel-originated conversations. Chats always exists, uses an empty app-managed working directory without injected identity, memory, prompt, or preboot files, and appears separately from user-managed workspaces.
_Avoid_: Global workspace, inbox mode

**New Chat**:
The conversation entry flow where a user chooses a model and may optionally choose a workspace before the first message is sent. If no workspace is chosen, the thread is created in Chats.
_Avoid_: Blank thread, draft session

**Thread**:
An individual conversation inside a workspace. A thread chooses its provider when it starts, keeps that provider once it has history, and receives a deterministic title from its first user message unless manually renamed.
_Avoid_: Session, run log

**Pi Thread**:
A v3 thread whose identity and agent history begin in Pi. Legacy thread records and Mastra message history are removed at the v3 boundary rather than migrated into Pi Threads.
_Avoid_: Migrated thread, legacy session

**Agent Runtime**:
The single application-owned execution boundary that connects every TIA work entry point to Pi. Desktop chat, channels, and automations share this boundary rather than retaining separate legacy harnesses.
_Avoid_: Mastra runtime, chat backend, legacy runtime

**Agent Transport**:
The authenticated local HTTP and event-stream boundary through which the renderer controls and observes the Agent Runtime. It supports both the Electron renderer and browser annotation mode without exposing embedded Pi SDK objects or credentials.
_Avoid_: AI SDK transport, preload agent bridge, raw Pi protocol

**Guarded Desktop Validation**:
A bounded, actively observed desktop test run that is stopped when session creation loops, repeated server failures, sustained excessive resource use, or orphaned child processes appear. It is the only accepted way to run real desktop end-to-end checks.
_Avoid_: Unobserved E2E, open-ended dev launch, manual spot check

**Provider Configuration**:
TIA Studio's user-managed choice of model provider, credentials, endpoint, model, and default status. It configures Pi execution without becoming agent instructions or Pi-owned authentication state.
_Avoid_: Assistant provider, Pi auth file, prompt configuration

**Workspace Access**:
The per-thread, persisted permission policy applied to a Pi Thread's filesystem and command execution. New threads use Standard Access for routine workspace work with targeted approvals; Full Access explicitly skips those approval gates for that thread.
_Avoid_: Agent prompt, provider permission, unrestricted renderer access

**Thread Details**:
The contextual companion surface for a selected thread. It summarizes the thread's workspace, fixed model choice, relevant capabilities, and origin context without becoming a primary navigation or settings surface.
_Avoid_: Review panel, browser panel, settings drawer

**Channel Thread Binding**:
A persistent mapping from one external remote chat to one TIA thread. Repeated messages from the same remote chat continue in the same TIA thread until an explicit future rule creates a new one.
_Avoid_: Per-message thread, temporary route

**Channel**:
An optional external messaging connection routed through the Agent Runtime. Channel-originated conversations are represented as threads in the built-in Chats workspace without an intervening assistant profile.
_Avoid_: Workspace, inbox, app mode

**Automation**:
An explicit time-based run that starts a real new thread inside a named workspace. Automation replaces heartbeat-style background behavior and cron-owned hidden work logs with user-visible assistant work, and it is managed from its own dedicated page instead of inside the workspace chat view.
_Avoid_: Heartbeat, cron job, background ping

**Skills**:
The user-facing surface for adding or enabling reusable assistant capabilities. Skills is the product term, even when the underlying implementation may use MCP servers or other integration machinery.
_Avoid_: Plugins, MCP page

**Appearance Tokens**:
The user-adjustable visual settings that control TIA Studio's base theme, accent color, background color, and foreground color. Appearance Tokens preserve the product's visual system while allowing personal tuning.
_Avoid_: Custom CSS, skin, arbitrary theme
