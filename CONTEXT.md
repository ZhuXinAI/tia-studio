# TIA Studio

TIA Studio is a local-first AI desktop workspace. Its core concepts define how people organize ongoing AI work, configure model behavior, and attach optional operational capabilities.

## Language

**Workspace**:
The primary place where a user organizes AI work. A workspace is a folder-backed container for threads, along with the default assistant configuration that powers those threads. Its folder path is fixed after creation unless the user explicitly relocates it.
_Avoid_: Team, project shell, mode

**Relocation**:
The explicit repair flow for a workspace whose original folder path is no longer available. Relocation updates the workspace to a new path while preserving its existing threads and memory.
_Avoid_: Rename, automatic path update

**Workspace Deletion**:
Removing a workspace deletes its threads from TIA Studio instead of detaching or archiving them. A deleted workspace does not leave behind a standalone conversation history object.
_Avoid_: Detach workspace, archived shell

**Chats**:
The built-in workspace for ad-hoc conversations and channel-originated conversations. Chats always exists, cannot be removed, and appears in its own dedicated sidebar section rather than in the user-managed workspace list.
_Avoid_: Global workspace, inbox mode

**New Chat**:
The conversation entry flow where a user chooses a model and may optionally choose a workspace before the first message is sent. If no workspace is chosen, the thread is created in Chats.
_Avoid_: Blank thread, draft session

**Thread**:
An individual conversation inside a workspace. A thread chooses its provider when it starts, and that provider stays fixed once the thread has message history.
_Avoid_: Session, run log

**Thread Details**:
The contextual companion surface for a selected thread. It summarizes the thread's workspace, fixed model choice, relevant capabilities, and origin context without becoming a primary navigation or settings surface.
_Avoid_: Review panel, browser panel, settings drawer

**Channel Thread Binding**:
A persistent mapping from one external remote chat to one TIA thread. Repeated messages from the same remote chat continue in the same TIA thread until an explicit future rule creates a new one.
_Avoid_: Per-message thread, temporary route

**Assistant**:
An AI worker profile that can participate inside a workspace. An assistant may remain a distinct concept even when the product is presented through a workspace-first interface.
_Avoid_: Team member, bot persona

**Default Assistant**:
The hidden assistant that powers a workspace's core chat behavior. It owns runtime instructions, tools, model behavior, and execution context, but it is not exposed as a first-pass management surface in the product.
_Avoid_: Visible assistant, workspace mode

**Channel**:
An optional external messaging connection attached to an assistant. In the first-pass product, channels are configured through the workspace default assistant, and channel-originated conversations are routed into the built-in Chats workspace.
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
