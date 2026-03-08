# Team Chat Main Surface and Status Drawer (Design)

## Context

The first Team layout revision fixed internal scrolling and improved visible status styling, but two practical issues remain:

- selecting a Team thread triggers a `404` resume-stream request because the Team frontend asks the AI SDK to reconnect to a stream route the Team backend does not implement
- the Team status graph still feels too prominent compared with the actual primary workflow, which is chatting with the supervisor

Product direction also changed after manual testing. The floating chat overlay is less elegant than expected because the supervisor conversation is the main activity, while live status is a supporting concern that can sit behind an on-demand panel.

## Goals

- Restore Team chat as the primary surface on the Team page.
- Move Team status into a right-side drawer that is collapsed by default.
- Fix the Team thread selection `404` by stopping the frontend from trying to resume a non-existent Team stream route.
- Make the React Flow graph fully view-only so users cannot drag or otherwise manipulate it during status inspection.

## Non-goals

- No migration away from React Flow in this pass.
- No backend redesign for resumable Team streams.
- No tabbed status experience in this pass.
- No new persistence or server-side Team data model changes.

## Root Cause Findings

### Team thread selection `404`

- `useTeamPageController` currently configures Team chat with:
  - `id: team:<threadId>`
  - `resume: true`
- The AI SDK reconnect behavior builds a GET route shaped like:
  - `/team-chat/<threadId>/<chatId>/stream`
- The Team backend only implements:
  - `POST /team-chat/:threadId`
  - `GET /team-chat/:threadId/history`
  - `GET /team-chat/:threadId/runs/:runId/status`
- Therefore the reconnect request is invalid by construction and must be disabled on the client until Team resumable streams exist.

### React Flow interaction leak

- Current props disable common interactions such as drag and pan, but the graph is not yet configured as a fully static, non-focusable inspection surface.
- The graph should behave like a read-only visualization panel, not an interactive canvas.

## Product Direction

### Main Team layout

- The Team page should mirror the normal chat workflow:
  - left sidebar for workspaces and threads
  - main chat surface for the supervisor conversation
  - optional right-side status drawer for runtime inspection
- The chat card should regain the primary layout slot.

### Status drawer

- The Team status panel should slide in from the right.
- The drawer should start collapsed.
- A trigger button should remain visible while collapsed so status is easy to open.
- The drawer content should contain:
  - React Flow status graph
  - event log

### Team chat runtime

- Team chat should not request AI SDK stream resume until the backend supports resumable Team stream routes.
- Thread history loading remains unchanged.
- Status streaming remains independent through the existing Team run status SSE endpoint.

### React Flow behavior

- The graph should be explicitly locked to view-only mode:
  - no node dragging
  - no element selection
  - no drag-selection behavior
  - no focusable nodes or edges
  - no viewport panning via drag or keyboard activation
- Animated edges remain useful because they communicate active delegation.

## Architecture

### Page shell

- Update `src/renderer/src/features/team/pages/team-page.tsx` to render the chat card as the primary panel again.
- Add local UI state for the right-side status drawer open/closed state.
- Keep the existing `TeamConfigDialog` wiring and controller usage unchanged.

### Controller

- Update `src/renderer/src/features/team/hooks/use-team-page-controller.ts` so Team chat no longer enables stream resume.
- Keep Team status event handling intact.

### Status graph

- Update `src/renderer/src/features/team/components/team-status-graph.tsx` to enforce a fully static React Flow configuration.
- Preserve the visible node-state styling introduced in the previous pass.

## Testing Strategy

- Add regression coverage for:
  - Team page main-chat plus right-drawer shell
  - Team chat controller disabling AI SDK resume
  - static React Flow props
- Re-run focused Team tests first, then broader renderer verification.
