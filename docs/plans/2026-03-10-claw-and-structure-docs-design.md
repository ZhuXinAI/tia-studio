# CLAW and Structure Docs Design

## Summary

This update adds two reader-facing documents at the repository root:

- `CLAW.md` explains what a claw is in TIA Studio and how the app implements it with Mastra, channels, persistence, and the desktop runtime.
- `STRUCTURE.md` explains the main source folders and how responsibilities are split across the Electron main process, the renderer, preload, and shared test setup.

The design goal is to keep both documents approachable for new contributors and technical readers without turning them into endpoint-by-endpoint API reference material.

## Audience

These documents target readers who want to understand the system architecture quickly:

- contributors exploring the project for the first time,
- readers coming from the README who want more context,
- developers who need a guided explanation before reading source files.

They are not intended to replace lower-level implementation references such as `docs/claws.md` or the existing plan documents.

## Decisions

### 1. Add new root-level explainers instead of moving existing docs

We keep `docs/claws.md` as the lower-level implementation reference and add a new `CLAW.md` at the root for the more narrative explanation the user requested.

This keeps the existing doc stable while giving the README a better destination for architecture readers.

### 2. Keep `CLAW.md` reader-friendly but source-grounded

`CLAW.md` should explain:

- the assistant-first claw model,
- why there is no dedicated `claws` table,
- how Mastra powers the assistant runtime,
- how channel adapters, the event bus, and thread bindings complete delivery,
- how assistant-owned features such as cron and heartbeat remain attached to the same identity.

It should mention the main files involved, but it should prioritize flow and mental model over exhaustive implementation detail.

### 3. Keep `STRUCTURE.md` focused on the main source directories

Per the user’s clarification, `STRUCTURE.md` should focus on the main project folders rather than generated or build output directories.

The document should therefore center on:

- `src/main`
- `src/renderer/src`
- `src/preload`
- `src/test`

Within those areas, it should explain the major subfolders that matter for feature work.

### 4. Update README links inside the relevant sections

`README.md` should link to:

- `CLAW.md` from the claws section,
- `STRUCTURE.md` from the project structure section.

This keeps the README concise while giving readers a clear path to deeper material.

### 5. Align the release version with the new tag

Because the user asked for a new release tag after the docs update, the repo version should move from `0.1.8` to `0.1.9` so the package version and release tag stay aligned.

## Document Shape

### `CLAW.md`

Planned sections:

1. What a claw is
2. Why the model is assistant-first
3. The main building blocks
4. Where Mastra fits
5. The lifecycle from setup to message delivery
6. How heartbeat, cron, and identity stay assistant-owned
7. Key files to read next

### `STRUCTURE.md`

Planned sections:

1. Repository mental model
2. `src/main`
3. `src/renderer/src`
4. `src/preload`
5. `src/test`
6. How a feature usually crosses the stack

## Verification

Verification should stay lightweight and documentation-focused:

- confirm the new links in `README.md` resolve correctly,
- run Prettier against the touched Markdown and JSON files,
- review `git diff` for clarity and scope before committing, tagging, and pushing.
