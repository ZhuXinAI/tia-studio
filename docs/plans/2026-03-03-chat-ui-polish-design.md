# Chat UI Polish (Design)

## Context

The chat page already uses assistant-ui primitives for rendering thread messages, but the message composer is a local controlled `<Textarea>` without dictation support. Thread deletion is currently a single click, and the dark theme background is a cool/blue-tinted dark color rather than a near-black neutral.

## Goals

- Dark theme uses Tailwind `neutral-800` as the app background.
- Deleting a thread requires a lightweight, inline confirmation (tooltip-style) instead of immediately deleting.
- Add dictation (speech-to-text) using assistant-ui dictation primitives.
- Add a message action overflow menu using assistant-ui `ActionBarMorePrimitive`.
- Keep existing app/thread routing, API calls, and `useChat` transport behavior intact.

## Non-goals

- No migration to assistant-ui thread list primitives.
- No attachments flow changes.
- No text-to-speech (speaking) changes.
- No large visual redesign of the chat layout.

## UX / UI

### Dark theme background

- Set the dark theme `--background` token to `#262626` (Tailwind `neutral-800`).
- Keep existing card/background translucency patterns (e.g. `bg-background/50`, `bg-card/78`) so the page retains depth.

### Thread delete confirmation

- Clicking the thread trash icon opens a small anchored confirmation bubble:
  - Copy: "Delete thread?"
  - Buttons: "Cancel" and "Delete" (destructive)
- Dismiss on outside click or `Escape`.
- Disable actions while the thread is actively deleting.

### Dictation (voice input)

- In the composer toolbar, show a "Voice input" control that:
  - Starts dictation when idle.
  - Stops dictation when dictating.
- While dictation is active, show the interim transcript preview (subtle text above/near the input).
- If Web Speech API dictation is unsupported, keep the control disabled (no errors).

### Message actions overflow menu (ActionBarMore)

- For assistant messages, show a small "More" menu button (three dots) that opens a dropdown with:
  - Copy
  - Reload (regenerate)
  - Export Markdown
- Use action bar autohide behavior so the button is unobtrusive (visible on hover / last message as appropriate).

## Technical Design

### Runtime + Dictation adapter

- Move assistant-ui runtime creation to the chat card so both the message list and composer can share the same `AssistantRuntimeProvider`.
- Create the runtime via `useAISDKRuntime(chat, { adapters: { dictation } })`.
- Configure `dictation` with `WebSpeechDictationAdapter` when `WebSpeechDictationAdapter.isSupported()` is true.

### Composer integration

- Replace the controlled `<Textarea>` with assistant-ui composer primitives:
  - `ComposerPrimitive.Input`
  - `ComposerPrimitive.Dictate`
  - `ComposerPrimitive.StopDictation`
  - `ComposerPrimitive.DictationTranscript`
- Keep the existing send flow (create-thread-first when no thread is selected) by preventing the default `ComposerPrimitive.Root` submission and delegating to the existing controller submit handler.
- Sync composer text between assistant-ui composer state and the existing `composerValue` controller state so:
  - typing updates controller state
  - dictation updates controller state
  - controller-driven clears/restores update the assistant-ui input

### Message actions (ActionBarMore)

- Add an `ActionBarPrimitive.Root` to the assistant message bubble.
- Use `ActionBarMorePrimitive` for dropdown UI and call message-scoped actions via `useAui()`:
  - Copy via `aui.message().getCopyText()` + clipboard write
  - Reload via `aui.message().reload()`
  - Export Markdown via a blob download (or custom handler)

## Implementation Outline

- Theme
  - Update `.dark --background` in `src/renderer/src/assets/main.css`.
- Thread delete confirm
  - Update `ThreadSidebar` to gate `onDeleteThread` behind an inline confirm bubble.
  - Add outside-click + escape handling similar to the existing assistant actions menu.
- Dictation
  - Lift `AssistantRuntimeProvider` to `ThreadChatCard`.
  - Configure dictation adapter in `useAISDKRuntime` call.
  - Replace textarea UI with assistant-ui composer primitives + dictation controls.
- Message actions
  - Add ActionBarMore menu UI to assistant message bubble.

## Testing

- Update existing component tests to reflect:
  - Message list no longer owns runtime creation.
  - Composer renders assistant-ui primitives (smoke assertions).
  - Thread sidebar delete requires confirmation before invoking `onDeleteThread`.

## Edge Cases

- Dictation unsupported in the current environment: voice UI stays disabled.
- Deleting the currently selected thread: confirmation should still work and navigation fallback remains unchanged.
- Long thread titles or narrow sidebar: confirmation bubble should not break layout (allow wrapping within a max width).

