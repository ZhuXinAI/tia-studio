# Assistant Workspace Template Refresh Design

## Context

TIA Studio currently bootstraps assistant workspaces with four placeholder files in `src/main/mastra/assistant-workspace.ts`:

- `IDENTITY.md`
- `SOUL.md`
- `MEMORY.md`
- `HEARTBEAT.md`

The current content is intentionally minimal, but it does not give a newly created assistant workspace much guidance about identity, tone, continuity, or how these files should be used over time.

The gateway project already has stronger workspace templates in `/Users/windht/Dev/Buildmind2026/tia-gateway/src/mastra/workspace/tia-templates.ts`, especially for `IDENTITY.md` and `SOUL.md`. Those templates provide a better starting posture without changing how the runtime reads or writes workspace files.

## Goals

- improve the default assistant workspace boilerplate for newly created workspaces
- reuse the tone and structure of the gateway `IDENTITY.md` and `SOUL.md` templates
- keep TIA Studio self-contained by copying and adapting template text rather than importing another repo
- preserve current bootstrap behavior: create missing files only and never overwrite existing files
- keep the file set unchanged so runtime behavior stays stable

## Non-goals

- no shared runtime dependency on the gateway repository
- no new workspace files such as `USER.md`, `TOOLS.md`, or `BOOTSTRAP.md`
- no change to how workspace files are loaded into the Mastra runtime
- no migration of already-created workspaces

## Recommended Approach

### 1. Keep the existing four-file bootstrap contract

`ensureAssistantWorkspaceFiles(...)` should continue creating only:

- `IDENTITY.md`
- `SOUL.md`
- `MEMORY.md`
- `HEARTBEAT.md`

This avoids widening scope and keeps the existing tests, workspace expectations, and runtime integrations simple.

### 2. Copy and adapt the gateway voice into Studio-owned templates

`IDENTITY.md` should adopt the gateway structure that helps an assistant define:

- name
- creature or nature
- vibe
- emoji
- avatar

`SOUL.md` should adopt the richer guidance around helpfulness, personality, trust, boundaries, vibe, and continuity.

The copied text should be adapted to TIA Studio's current workspace model so it feels native in this repo and does not reference gateway-only files or setup steps.

### 3. Bring `MEMORY.md` and `HEARTBEAT.md` up to the same quality bar

The gateway file does not provide a direct `MEMORY.md` template, so TIA Studio should expand its existing `MEMORY.md` content into a short but useful scaffold that explains what belongs there and how to maintain it.

`HEARTBEAT.md` should remain operationally conservative: empty or comment-only content means no proactive heartbeat behavior, while explicit tasks opt in to periodic checks.

### 4. Tighten tests around meaningful content

The current tests only verify that the generated files contain their markdown headings. That protects file creation but not template quality.

Update the bootstrap tests to assert a few stable phrases from the richer templates so regressions are caught if the content is accidentally reduced back to placeholders.

## Components

- `src/main/mastra/assistant-workspace.ts` owns the bootstrapped template strings
- `src/main/mastra/assistant-workspace.test.ts` verifies file creation, non-overwrite behavior, and path resolution
- `docs/plans/...` captures the design and implementation intent for the change

## Data Flow

1. An assistant workspace root is created or resolved.
2. `ensureAssistantWorkspaceFiles(...)` checks each expected file.
3. Missing files are written with the improved template content.
4. Existing files are left untouched.
5. The rest of the runtime keeps reading the same file names as before.

## Error Handling

- file creation behavior stays unchanged, so existing filesystem error handling remains valid
- no overwrite path is introduced, so user-authored workspace content stays protected
- because the file set is unchanged, downstream consumers do not need new guards

## Testing Strategy

Add coverage for:

- bootstrapped `IDENTITY.md` containing the richer identity scaffold
- bootstrapped `SOUL.md` containing the richer operating guidance
- bootstrapped `MEMORY.md` and `HEARTBEAT.md` containing their updated instructions
- preserving existing files without overwrite
- preserving relative path resolution behavior

## Open Decisions Resolved

- **Shared source of truth:** copy and adapt, not import
- **Scope:** improve only the four files TIA Studio already bootstraps
- **Migration:** new workspaces only; existing files remain untouched
