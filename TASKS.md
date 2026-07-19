# TIA Studio v3 Pi harness

This is the durable implementation tracker for the destructive v3 harness cutover defined by `PI_MIGRATION.md` and `docs/adr/0001` through `docs/adr/0012`.

## 0. Discovery and contract

- [x] Inventory the current architecture in `docs/pi-migration/CURRENT_ARCHITECTURE.md`.
- [x] Resolve legacy data, Assistant removal, transport, provider, permission, packaging, scope, Chats, naming, and UI-action decisions.
- [x] Update `PI_MIGRATION.md` where the accepted v3 decisions intentionally supersede its legacy-feature-flag, IPC, and optional-runtime language.

## 1. Application-owned runtime and Pi transport

- [x] Define application-owned session, message, content, interaction, command, error, and event schemas.
- [x] Add pure, idempotent event reducers and message reconstruction.
- [x] Pin and bundle `@earendil-works/pi-coding-agent`.
- [x] Embed Pi with `ModelRuntime`, `SessionManager`, and `createAgentSession` in Electron main.
- [x] Map typed Pi SDK events for text, thinking, tools, queues, retries, compaction, and interactions.
- [x] Implement in-process session lifecycle, cancellation, disposal, persistence, and no prompt replay.
- [x] Add unit and protocol-fixture tests.

## 2. V3 persistence and destructive migration

- [x] Replace assistant-owned threads with workspace/Pi-session-owned records.
- [x] Persist provider/model/thinking, Pi session identity/file, status, access mode, and deterministic titles.
- [x] Store application-owned normalized messages/events needed for fast rendering and recovery.
- [x] Add the v3 migration that clears legacy threads/history and removes Assistant-related tables/columns/bindings.
- [x] Add an isolated, empty Chats working directory without identity/memory/prompt preboot.
- [x] Remove legacy usage backfill tied to Mastra messages.
- [x] Cover fresh install and destructive upgrade with migration/repository tests.

## 3. Runtime manager and local HTTP/SSE API

- [x] Implement create, resume, send, steer, follow-up, cancel, model, thinking, access-mode, rename, interaction-response, messages, and subscription operations.
- [x] Validate every HTTP payload and authorize workspace paths.
- [x] Keep Pi SDK sessions, provider credentials, and Pi-specific objects in Electron main.
- [x] Apply only the selected provider credential to the in-memory `ModelRuntime`; never create a child-process environment.
- [x] Replace AI SDK chat bodies/streams with application-owned snapshots, commands, and ordered SSE events.
- [x] Preserve live runs across thread navigation and resume sessions after restart.
- [x] Route channels through the same runtime without Assistant IDs and document the same rule for any future app-owned automation executor.
- [x] Pause channel-triggered work on approvals and surface the pending interaction in the desktop thread.

## 4. Permissions

- [x] Default every thread to persisted Standard Access.
- [x] Auto-allow routine workspace reads/writes and non-destructive commands.
- [x] Require in-thread approval for shell commands and writes outside the workspace; block credential-file access outright.
- [x] Block TIA Studio credential storage from Pi.
- [x] Implement per-thread Full Access that skips approval gates and remains visibly active.
- [x] Model remembered Bash permissions as structured argv-prefix rules with hard-block, deny, ask, and allow precedence.
- [x] Add Deny, Allow once, Allow for session, and workspace-scoped approval outcomes to the in-thread permission interaction.
- [x] Persist workspace approvals, keep session approvals memory-only, and evaluate simple compound commands segment by segment.
- [x] Refuse reusable-rule generation for complex shell syntax, package installers, interpreters, privilege wrappers, and destructive commands.
- [x] Add a Command Permissions settings page with scope, source, rationale, last-used time, and revoke controls.
- [x] Test policy classification, interaction lifecycle, and persistence.

## 5. Official assistant-ui thread

- [x] Run `npx shadcn@latest add @assistant-ui/thread` and keep the generated component as the foundation.
- [x] Feed it with `useExternalStoreRuntime` over application-owned messages and actions.
- [x] Render streaming text, reasoning, tools, errors, queues, recovery, and permission interactions.
- [x] Add image attaching and map images through the application/Pi boundary.
- [x] Add feature-detected native speech input with clear recording/error states.
- [x] Implement `ThreadEmpty` for a new Pi conversation.
- [x] Add Standard/Full Access and idle/steer/follow-up composer behavior.
- [x] Keep copy/cancel/rename and remove unsupported edit/regenerate/branch actions.
- [x] Preserve the existing thread-list shell and shell-owned status/context surfaces.
- [x] Localize the home sidebar, thread controls and states, attachment/reasoning chrome, Skills catalog, and Schedules editor.
- [x] Make marketplace skill installs independent of an external Git executable and return actionable HTTP errors.
- [x] Delete the replaced custom thread card, message list, transport adapter, and obsolete styling/components.

## 6. Full legacy cleanup

- [x] Delete `src/main/mastra`, default-assistant bootstrap, assistant routes/repos/queries, prompting/security processors, preboot workspace files/tools, and legacy delegation code.
- [x] Remove Assistant IDs and copy from workspaces, threads, channels, automations, settings, migrations, tests, and translations.
- [x] Remove Mastra, AI SDK UI/runtime/provider, LangChain, ACP-provider, and other dependencies proven unused after Pi integration.
- [x] Remove obsolete feature flags, compatibility adapters, fixtures, TODOs, and documentation references.
- [x] Verify repository searches contain no live Mastra, Assistant entity, SOUL/MEMORY preboot, AI SDK HarnessAgent, or remote-runtime implementation remnants.

## 7. Validation and completion audit

- [x] Run focused runtime, mapper, persistence, route, channel, and renderer tests during implementation.
- [x] Run `npm run lint`.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run browser coverage with `pnpm run e2e:guarded:annotate`, then one final native pass with `pnpm run e2e:guarded`; continuously observe the process tree and logs; abort on repeated session creates, repeated 5xx responses, or sustained excessive CPU; exercise a real Pi repository task, navigation during execution, restart/resume, image attachment, voice when supported, and Standard/Full Access.
- [x] Confirm the packaged Pi SDK is embedded and no Pi child process is created.
- [x] Audit every objective and tracker item against current files and runtime evidence before marking the goal complete.
