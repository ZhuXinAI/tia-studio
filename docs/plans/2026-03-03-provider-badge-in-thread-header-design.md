# Provider Badge In Thread Header (Design)

## Context

The thread header (chat page) currently shows the thread title, an assistant-status chip (e.g. "Planner chat"), and a Configure button. Assistants already store a `providerId`, and the app loads provider records (name + selected model) on the thread page.

## Goal

Add provider information to the thread header as a small badge so users can quickly confirm which provider/model the active assistant is using.

## Non-goals

- No provider switching from the header.
- No new provider/model fetching behavior.
- No iconography redesign beyond a simple badge.

## UX / UI

- Placement: in the right-side header cluster, render the provider badge before the existing "{assistant} chat" chip, followed by the Configure button.
- Copy:
  - Default: `{provider.name} ({provider.selectedModel})`
  - If `selectedModel` is empty after trimming: `{provider.name}`
  - If the provider cannot be resolved from `selectedAssistant.providerId`: hide the badge (no placeholder).
- Behavior:
  - Truncate long labels in the header row.
  - Add `title` with the full label for hover discovery.

## Data / State

- Resolve the provider from the currently selected assistant:
  - `provider = providers.find((p) => p.id === selectedAssistant.providerId)`
- Derive a `providerBadgeLabel` string in the thread page controller and pass it into the thread header component.

## Implementation Outline

- `useThreadPageController`
  - Add `selectedProvider` / `providerBadgeLabel` derived from `selectedAssistant` + `providers`.
  - Expose `providerBadgeLabel` to the page.
- `ThreadPage`
  - Pass `providerBadgeLabel` into `ThreadChatCard`.
- `ThreadChatCard`
  - Render a compact pill badge when `providerBadgeLabel` is present.
  - Keep existing single-line header behavior (no wrapping).

## Testing

- Update the server-render test for `ThreadChatCard` to assert the provider badge renders when `providerBadgeLabel` is provided.

## Edge Cases

- Provider deleted or disabled while an assistant still references it: badge is hidden.
- Provider name/model very long: truncated in UI, full string available via `title`.
