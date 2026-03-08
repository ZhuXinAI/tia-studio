# Team Home-Shell Status Dialog (Design)

## Context

The prior Team revisions fixed the invalid stream resume request and made the status graph read-only, but the page still did not match the Home chat experience closely enough. The desired interaction is:

- Team page layout should visually match Home
- chatting with the supervisor should remain the main activity
- status inspection should be secondary and opened on demand from the composer

## Goals

- Match the Home page shell exactly:
  - left sidebar
  - right main chat area
  - same bordered container treatment
- Move `Open Team Status` into the composer action row.
- Style the status trigger as a ghost button to the left of `Send` / `Stop`.
- Open Team status in a dialog instead of an in-page drawer.
- Show only the React Flow graph in the dialog for now.

## Non-goals

- No event log in the status dialog.
- No change to the Team stream/status runtime wiring.
- No change away from React Flow.

## Product Direction

### Team shell

- Reuse the same page structure as Home:
  - `section` shell with the same border and background classes
  - `TeamSidebar` on the left
  - `SidebarInset` on the right
  - `TeamChatCard` as the primary content

### Status trigger

- The trigger belongs in the composer action row.
- It should be a ghost-style button labeled `Open Team Status`.
- It should appear directly to the left of `Send` or `Stop`.

### Status dialog

- Opening the trigger shows a modal dialog.
- The dialog contains only the Team status graph.
- The graph remains live-updating from the existing Team status event stream.

## Testing Strategy

- Add coverage for:
  - Home-style Team page shell
  - presence of the composer-level status trigger
  - graph-only rendering mode without the event log
