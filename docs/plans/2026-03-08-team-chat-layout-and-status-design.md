# Team Chat Layout and Status (Design)

## Context

The current Team surface mixes three problems:

- the chat surface does not own its own scroll area, so long conversations scroll the entire page
- the layout gives the chat pane equal visual weight with the status graph, even though the Team page should emphasize agent activity
- the React Flow status surface does not clearly communicate state changes, and it may also be missing required library styling

The direct chat page already has the right containment model: a fixed-height shell with `overflow-hidden` and nested internal scrollers. The Team page should follow the same containment rules while evolving toward a more status-first workspace.

## Goals

- Keep Team chat scrolling inside the chat panel instead of scrolling the entire page.
- Move Team chat into a floating bottom-right panel so the main surface can focus on team activity.
- Make Team status visibly reflect `idle`, `running`, `done`, and `error` states in React Flow.
- Keep the Team sidebar stable and readable while the other surfaces change.

## Non-goals

- No new persistence or API changes.
- No minimize, resize, or drag interactions for the floating chat in this pass.
- No change to how status events are produced by the server unless debugging proves the client is not receiving them.

## Product Direction

### Step 1: Fix scroll ownership first

- The Team page should use a fixed-height shell comparable to the main chat page.
- The page root should be `overflow-hidden`.
- Sidebar, graph, event log, and chat transcript should each manage their own internal scrolling.
- This change should preserve the existing information architecture before any floating-panel redesign.

### Step 2: Make Team chat a floating docked panel

- `TeamChatCard` moves out of the three-column layout and becomes a docked panel in the bottom-right corner.
- The floating panel stays open by default in this pass.
- The main layout becomes:
  - left: Team sidebar
  - center: Team status graph and event log
  - overlay bottom-right: Team chat
- The floating panel should remain fully usable while not obscuring the left navigation.

### Step 3: Finish visible Team status indication

- Import the React Flow stylesheet so nodes, handles, and controls render correctly.
- Apply explicit visual treatments for node states:
  - `idle`: muted
  - `running`: highlighted/accented
  - `done`: success-style
  - `error`: destructive-style
- Keep edge animation only while a member is running.
- Keep the event log visible and internally scrollable under long run histories.

## Architecture

### Layout shell

- Update `src/renderer/src/features/team/pages/team-page.tsx` to use a fixed-height, `overflow-hidden` container.
- Split the Team surface into a base two-column layout plus a floating overlay for chat.
- Preserve `TeamConfigDialog` placement and controller wiring.

### Chat panel

- Update `src/renderer/src/features/team/components/team-chat-card.tsx` to support a floating presentation.
- Keep the message list and composer structure intact so the runtime integration does not change.
- Ensure the transcript area remains the only scrollable area inside the card.

### Status graph

- Update `src/renderer/src/features/team/components/team-status-graph.tsx` to style nodes based on derived supervisor/member states.
- Keep the current event-derived status mapping, but make the result visible in the UI instead of only exposing `data-state`.
- Ensure the event log uses its own internal scroller.

## Testing Strategy

- Add renderer tests covering:
  - Team page shell classes needed for overflow containment
  - floating Team chat rendering
  - visible node-state styling for running/error states
- Keep tests targeted to Team UI files first.
- Run broader renderer and project tests after the focused checks pass.

## Rollout Order

1. Add regression tests for scroll containment and visible status styling.
2. Fix the Team shell so page-level scrolling stops.
3. Move the chat card into the bottom-right floating panel.
4. Finish React Flow status visuals and scrolling behavior.
5. Verify targeted Team tests, then run broader verification.
