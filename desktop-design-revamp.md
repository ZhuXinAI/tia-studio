# Hermes Desktop UI Revamp Plan

## Goal

Rebuild TIA Studio's desktop UI to visually match the Hermes desktop app as closely as possible, while keeping our own agent/runtime logic, data model, and Mastra-based backend behavior.

This plan is based on reading:

- `apps/desktop/src/app/desktop-controller.tsx`
- `apps/desktop/src/app/shell/app-shell.tsx`

Source references:

- [desktop-controller.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/desktop-controller.tsx)
- [app-shell.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/shell/app-shell.tsx)

## What Hermes Is Doing

### 1. One shell owns the whole window

Hermes routes almost the entire desktop app through a single `AppShell`, then mounts the actual content inside it. That shell is not just a wrapper. It owns:

- titlebar controls and drag regions
- status bar
- overlay stack
- pane sizing variables
- left-edge insets around traffic lights / native window buttons

For us, this means the target is not "copy a chat page." The target is "copy a window shell."

### 2. The app is pane-first, not page-first

`DesktopController` composes the main UI from resizable panes:

- chat sidebar pane
- center content pane (`PaneMain`)
- terminal pane
- preview rail
- file browser / right sidebar pane

Those panes can be:

- resized
- collapsed
- hover-revealed on narrow widths
- flipped left/right as a layout mode

The key implication: Hermes feels like a desktop workstation because the UI is structured as a persistent pane system, not a simple sidebar plus page layout.

### 3. The chat view is only one route inside the shell

The center area is a route switch inside `PaneMain`, with chat, skills, messaging, artifacts, and overlay-driven views all living inside the same shell. That gives Hermes:

- stable chrome
- stable pane widths
- persistent right-side tools
- consistent titlebar and statusbar behavior

For TIA Studio, the revamp should treat the shell as persistent and swap content inside it, instead of letting each feature page invent its own top spacing and header layout.

### 4. Overlays are first-class UI layers

Hermes separates core panes from overlay UI:

- onboarding
- install/update prompts
- command palette
- session switcher
- settings
- agents
- cron
- profiles

These are mounted outside the main pane content, but still inside the shell. That is why the app feels cohesive rather than modal-heavy.

### 5. Titlebar math is deliberate

`AppShell` calculates titlebar inset and drag zones from:

- window button position
- fullscreen state
- left-most pane visibility
- right-side tool clusters

That means the empty strip at the top is not accidental spacing. It is part of a native-desktop layout contract.

For our copy, we should stop treating top spacing as ad hoc padding and instead make it part of a shared titlebar system.

## UI Traits We Need To Match

### Window shell

- native-feeling top chrome
- exact traffic-light/titlebar clearance
- consistent drag region with `no-drag` controls
- bottom status bar that stays present across routes

### Main layout

- persistent session/chat sidebar as a true pane
- persistent center chat workspace
- persistent right rails instead of page-local floating panels
- resize handles and collapsible behavior

### Interaction model

- overlays layered above the shell, not inside random pages
- narrow-screen hover-reveal behavior for collapsed rails
- stable shell while content routes change

### Visual tone

- tighter, more utility-like desktop spacing
- less "page header" feeling
- more "tool window / workstation" feeling
- controls anchored into chrome, not floating as isolated cards

## Gap Between Current TIA Studio And Hermes

Today our App V2 shell is much closer to a styled web app:

- the left sidebar is custom, but not a true pane system
- the chat page still owns too much of its own top spacing and header composition
- the details rail behaves like a page-specific panel, not a shell-level right rail
- status and top controls are still distributed across page-local UI

The current tweaks I made in this task move us slightly toward Hermes:

- smaller thread header title
- details toggle moved into the top-left content strip
- reduced top strip height

But this is still a bridge step, not the revamp itself.

## Proposed Revamp Phases

### Phase 1. Build a real desktop shell

Create a shared shell that owns:

- titlebar spacing contract
- drag regions and `no-drag` islands
- left sidebar pane
- center content slot
- right rail slot
- bottom status bar
- overlay mount points

Deliverable:

- a new shell component that all App V2 routes render inside

### Phase 2. Replace ad hoc layout with pane primitives

Introduce a reusable pane model for:

- left session/workspace sidebar
- center main content
- right file/context/details rail
- optional terminal/preview rail

Requirements:

- resizable widths
- persisted open/closed state
- hover-reveal or temporary overlay mode for narrow widths
- optional left/right flipped placement later if desired

### Phase 3. Move thread details into the right rail system

The current thread details panel should stop being a special-case page appendage.

Instead:

- thread details becomes one right-rail mode
- future file browser / context explorer can share the same rail system
- the rail toggle belongs to shell chrome, not only the thread page

### Phase 4. Rebuild top chrome to match Hermes behavior

Implement a titlebar-aware header system that handles:

- traffic-light / native-window-button clearance
- top-left tool placement
- right-side tool clusters
- consistent drag-region spans

This should remove route-specific `pt-*` guessing and replace it with one source of truth.

### Phase 5. Add a shell-level status bar

Hermes keeps utility/status information outside the chat page itself. We should do the same.

Move shell-worthy status into a persistent bottom bar:

- current model
- token usage summary
- runtime / connection state
- quick tool entry points when applicable

The chat page should only own conversation-specific UI.

### Phase 6. Normalize overlays

Refactor settings, command surfaces, and future modal/overlay experiences so they mount from shell level with consistent layering and dismissal patterns.

## Recommended File Direction In TIA Studio

### Shell

- `src/renderer/src/app/v2/app-v2-shell.tsx`
- likely split into a new shell module set rather than keep expanding one file

Suggested additions:

- `src/renderer/src/app/v2/shell/app-v2-desktop-shell.tsx`
- `src/renderer/src/app/v2/shell/titlebar.tsx`
- `src/renderer/src/app/v2/shell/statusbar.tsx`
- `src/renderer/src/app/v2/shell/panes/*`

### Left pane

- evolve `src/renderer/src/app/v2/app-v2-sidebar.tsx` into a pane-backed sidebar

### Center chat

- keep thread/chat logic in the thread features area
- strip shell concerns out of `thread-page-v2.tsx` and `thread-chat-card.tsx`

### Right rail

- evolve `src/renderer/src/app/v2/thread-details-panel.tsx` into one right-rail view among several

## Acceptance Criteria For "Exact Copy" Direction

We should consider the revamp successful only if all of these are true:

- the top chrome feels structurally identical to Hermes
- the left sidebar, center chat, and right rail read as coordinated panes
- right-side tools do not feel like page-local bolted-on panels
- shell spacing is consistent across chat, skills, automations, and settings-adjacent routes
- overlays feel mounted above the shell, not inside individual pages
- the app still runs on our existing assistant/thread/runtime logic without changing the Mastra ownership model

## Implementation Order I Recommend

1. Extract shell primitives and titlebar spacing contract.
2. Convert the left sidebar into a pane.
3. Convert the details panel into a right rail.
4. Add shared resize/collapse behavior.
5. Add the persistent bottom status bar.
6. Migrate non-chat routes into the new shell without visual drift.
7. Do a final Hermes parity pass for spacing, rail widths, and chrome placement.

## Notes

- Do not copy Hermes agent/session logic.
- Do copy Hermes shell composition, pane hierarchy, overlay layering, and titlebar/statusbar ownership model.
- When implementation starts, we should keep doing it in thin increments so the app stays runnable after each step.
