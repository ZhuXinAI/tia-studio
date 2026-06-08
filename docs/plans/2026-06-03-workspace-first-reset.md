# Workspace-First Reset Implementation Plan

**Goal:** Reset TIA Studio into a workspace-first product with a built-in `Chats` workspace, named folder-backed workspaces, one hidden default assistant per workspace, global provider/channel settings, time-based automations, curated skills, and a cleaner Mastra-native browser/runtime stack.

**Glossary:** Follow [CONTEXT.md](/Users/windht/Dev/tia-studio/CONTEXT.md) for canonical terms. Do not reintroduce user-facing `team`, `claw`, `heartbeat`, `cron`, `plugin`, or assistant-management language in new UI unless explicitly required by legacy code being removed.

**Reset policy:** This is a clean reset with **no migration**. Existing `team`, `claws`, heartbeat, cron, legacy browser automation, and old route/state compatibility paths should be removed rather than redirected.

**Key product decisions:**

- `Workspace` is the only top-level work container.
- `Chats` is a built-in, non-removable workspace for ad-hoc and channel-originated conversations.
- Each workspace keeps one hidden default assistant in the data model, but assistant management is not a first-pass product surface.
- Named workspaces are created from a folder path, are not editable or renameable, and use `Relocate` when the original path disappears.
- Providers are global inventory, selected at new-chat time, and fixed once a thread has message history.
- Channels remain attached to assistants, but first-pass UI manages them through global `Settings > Channels`.
- Channel-originated conversations always route into `Chats`, with one persistent TIA thread per remote chat.
- `wechat-kf`, `team`, `claws`, heartbeat, cron, and custom browser automation are removed.
- Automations are time-based only, create real new threads, and are allowed only for named workspaces.
- `Skills` is the product term and starts as a curated catalog.
- Rebrand work starts after the technical reset stabilizes.

---

## Execution rules

- Prefer deletion over compatibility shims. The only compatibility boundary that matters is keeping the app buildable while the reset lands.
- Keep the hidden default assistant as runtime plumbing only; do not leak assistant terminology back into the new shell.
- Do not preserve old `team`/`claws` routes, state, or onboarding.
- Remove dead settings and i18n keys aggressively as each legacy surface is deleted.
- Apply TDD where practical, but favor focused test suites around the riskiest model and routing changes.
- Rebrand with Stitch only after the shell and runtime shape are stable enough that the screen structure will not churn again.

---

## Phase 1: Upgrade Mastra and remove custom browser automation

**Objective:** Move the runtime onto the newer Mastra surface before rebuilding product UX around it.

**Primary outcomes:**

- Upgrade `@mastra/*` packages to a version line that supports the official browser and channel APIs.
- Remove `tia-browser-tool`, built-in-browser automation mode logic, and the browser-mode selection UX.
- Standardize browser behavior around Mastra browser support.

**Likely files:**

- `package.json`
- `pnpm-lock.yaml`
- `src/main/mastra/assistant-runtime.ts`
- `src/main/mastra/tools/*browser*`
- `src/main/built-in-browser*.ts`
- `src/main/tia-browser-tool*.ts`
- `src/main/server/routes/built-in-browser-route.ts`
- `src/main/persistence/repos/web-search-settings-repo.ts`
- `src/renderer/src/features/settings/pages/web-search-settings-page.tsx`
- `src/renderer/src/features/threads/built-in-browser-query.ts`
- related tests under `src/main` and `src/renderer`

**Steps:**

1. Upgrade Mastra dependencies and fix compile/runtime breakages in the assistant runtime layer first.
2. Replace bespoke browser tool registration with the Mastra-native browser path.
3. Delete custom browser managers, contracts, renderer helpers, and visibility/runtime-mode settings that only existed for the old stack.
4. Simplify browsing settings to whatever remains necessary after the Mastra upgrade.
5. Run focused runtime/browser tests, then broader typecheck/build.

**Exit criteria:**

- No runtime code depends on `tia-browser-tool` or built-in browser automation.
- The app has a single browser story.

---

## Phase 2: Remove legacy product surfaces and dead runtime features

**Objective:** Clear out the old product model before introducing the new one.

**Primary outcomes:**

- Remove `team`, `claws`, heartbeat, cron, and `wechat-kf`.
- Remove their routes, services, settings pages, data fetchers, dialogs, and navigation.
- Keep only the pieces still needed for channels, direct chat, providers, and workspace-backed runtime behavior.

**Likely files:**

- `src/renderer/src/features/team/**`
- `src/renderer/src/features/claws/**`
- `src/renderer/src/features/settings/pages/channels-settings-page.tsx`
- `src/renderer/src/app/router.tsx`
- `src/renderer/src/app/layout/app-shell.tsx`
- `src/main/channels/wechat-kf-channel.ts`
- `src/main/channels/channel-service.ts`
- `src/main/channels/types.ts`
- `src/main/heartbeat/**`
- `src/main/cron/**`
- `src/main/server/routes/team-*.ts`
- `src/main/server/routes/claws-route.ts`
- `src/main/server/routes/assistant-heartbeat-route.ts`
- `src/main/default-team/**`
- i18n locale files and tests

**Steps:**

1. Remove `wechat-kf` from runtime, validators, settings/forms, docs, and dependency graph.
2. Delete heartbeat and cron services, routes, repos usage, UI pages, and related hidden-thread behavior.
3. Delete `team` and `claws` feature areas and remove all routes/navigation pointing to them.
4. Remove stale app-shell state that assumes `chat` vs `team` modes.
5. Trim dead i18n keys and tests after each deletion wave.

**Exit criteria:**

- No user-facing `team` or `claws` surface remains.
- No runtime path starts heartbeat or cron services.
- `wechat-kf` is absent from runtime and UI.

---

## Phase 3: Introduce the new workspace model

**Objective:** Re-center the app on `Workspace` and `Chats`.

**Primary outcomes:**

- Add a built-in `Chats` workspace.
- Treat named workspaces as folder-backed containers with fixed paths.
- Keep one hidden default assistant per workspace in the data model.
- Support relocation for missing workspace paths.

**Likely files:**

- `src/main/persistence/migrations/*`
- `src/main/persistence/repos/assistants-repo.ts`
- `src/main/persistence/repos/threads-repo.ts`
- `src/main/persistence/repos/team-workspaces-repo.ts` or replacement repo(s)
- `src/main/persistence/repos/team-threads-repo.ts` or replacement repo(s)
- `src/main/default-agent/**`
- `src/main/mastra/assistant-workspace.ts`
- `src/main/mastra/workspace-path-resolver.ts`
- `src/main/server/routes/threads-route.ts`
- `src/main/server/routes/team-workspaces-route.ts` or replacement routes
- related validators and tests

**Steps:**

1. Decide whether to reshape existing workspace/thread tables in place or replace them with cleaner workspace-first tables now that migration is not required.
2. Model the built-in `Chats` workspace explicitly, rooted under `~/.tia-studio`.
3. Ensure each workspace has one hidden default assistant record without exposing assistant CRUD in the new product.
4. Implement fixed-path workspace creation from a folder picker, missing-path detection, and explicit relocate flow.
5. Make workspace deletion remove its TIA threads immediately.

**Exit criteria:**

- The data model has a clear workspace-first owner for threads.
- `Chats` exists as a built-in workspace.
- Named workspaces are folder-backed and support relocation.

---

## Phase 4: Rebuild chat and channel behavior around workspaces

**Objective:** Make conversation flow match the new model.

**Primary outcomes:**

- New chat flow lets the user optionally choose a workspace and required model before first send.
- Provider/model stays fixed after the thread has message history.
- Channel-originated conversations route into `Chats`.
- Remote chat to thread bindings remain persistent.

**Likely files:**

- `src/renderer/src/features/threads/**`
- `src/renderer/src/app/routes/**`
- `src/main/server/routes/chat-route.ts`
- `src/main/server/routes/threads-route.ts`
- `src/main/channels/channel-message-router.ts`
- `src/main/persistence/repos/channel-thread-bindings-repo.ts`
- `src/main/persistence/repos/channels-repo.ts`
- `src/main/server/routes/providers-route.ts`
- query hooks and tests

**Steps:**

1. Replace assistant-first chat restoration logic with workspace-first thread restoration.
2. Build a dedicated `New Chat` entry screen that selects workspace optionally and model explicitly.
3. Lock provider/model selection once a thread has persisted messages.
4. Route all channel-created threads into `Chats`.
5. Preserve one TIA thread per remote chat using the existing binding concept.

**Exit criteria:**

- Users can start a thread in a named workspace or fall back to `Chats`.
- Providers are chosen at thread creation and cannot be changed once history exists.
- Channel threads always land in `Chats`.

---

## Phase 5: Rebuild shell, settings, skills, and automations

**Objective:** Land the simplified product navigation and operations surfaces.

**Primary outcomes:**

- Top-left actions become `New Chat`, `Skills`, and `Automations`.
- Sidebar shows named workspaces plus a dedicated `Chats` section.
- Main content stays workspace-scoped.
- Settings holds global providers and global channels.
- Skills starts as a curated catalog.
- Automations is a dedicated page for named workspaces only.

**Likely files:**

- `src/renderer/src/app/layout/**`
- `src/renderer/src/app/router.tsx`
- `src/renderer/src/features/settings/**`
- `src/renderer/src/features/assistants/**` (for deletions and hidden-plumbing adjustments)
- `src/renderer/src/features/threads/**`
- `src/renderer/src/features/team/**` replacements/new workspace UI
- `src/main/server/routes/*settings*`
- `src/main/skills/skills-manager.ts`
- `src/main/server/routes/channels*`

**Steps:**

1. Rebuild the shell around the new top-left action stack and workspace navigation.
2. Add a dedicated `Skills` page backed by a curated catalog and recommended skills.
3. Add an `Automations` page that only operates on named workspaces and creates real new threads.
4. Simplify settings IA so providers and channels are global nested pages.
5. Ensure any workspace-local right sidebar content stays strictly scoped to the current workspace.

**Exit criteria:**

- The shell no longer implies multiple app modes.
- Skills and automations have their own destinations.
- Channels and providers are managed from settings.

---

## Phase 6: Rebrand with Stitch after the reset stabilizes

**Objective:** Generate the new visual direction on top of the final product structure.

**Primary outcomes:**

- A new design system for the app.
- Two target screens designed in Stitch:
  - main interface
  - settings page

**Expected workflow:**

1. Create/update the Stitch design system once the IA is final.
2. Generate the main interface screen with:
   - top-left actions
   - workspace sidebar
   - central chat area
   - workspace-scoped right sidebar
3. Generate the settings screen with nested providers/channels and the rest of the simplified settings IA.
4. Translate the resulting direction into the renderer shell and styling system.

---

## Suggested implementation order

1. Phase 1: Mastra upgrade and browser cleanup
2. Phase 2: legacy surface deletion
3. Phase 3: workspace model reset
4. Phase 4: chat/channel behavior reset
5. Phase 5: shell/settings/skills/automations rebuild
6. Phase 6: Stitch-led rebrand

---

## Verification checklist

- `team`, `claws`, heartbeat, cron, and `wechat-kf` are gone from UI, runtime startup, and dependencies.
- The app boots into a workspace-first shell with `Chats`.
- Named workspaces are folder-backed, fixed-path, and relocatable when missing.
- Provider choice is selected at new-chat time and locked after message history exists.
- Channel routing lands in `Chats` with stable remote-chat bindings.
- Automations create real new threads and only work for named workspaces.
- Settings exposes global providers and global channels.
- A fresh user can understand the product without learning assistant/team/claw terminology.
