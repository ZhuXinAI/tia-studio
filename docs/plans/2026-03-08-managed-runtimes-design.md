# Managed Bun and UV Runtimes (Design)

## Context

TIA Studio currently assumes the host machine already has developer tooling installed. That creates friction for non-developer users, especially when MCP servers or skills depend on commands such as `npx`, `bunx`, `uv`, or `uvx`.

The existing MCP configuration surface already lets users define stdio servers in `src/renderer/src/features/settings/pages/mcp-servers-settings-page.tsx`, and MCP launch flows already converge in `src/main/mastra/assistant-runtime.ts`. That gives the app a clean place to guide setup in the renderer and a single place to normalize runtime behavior in the main process.

The goal is to make MCPs and runtime-backed skills work on machines that do not have Node.js or Python tooling preinstalled, without forcing users through a manual CLI setup flow.

## Goals

- Let users install managed `bun` and `uv` runtimes directly from TIA Studio.
- Download the latest available release from GitHub at install time instead of shipping pinned binaries with the app.
- Support macOS, Windows, and Linux in the same feature set.
- Store managed runtimes in an app-owned directory and prefer them automatically when launching compatible MCP servers.
- Provide a dedicated setup page with explicit install actions.
- Allow users to choose their own downloaded `bun` or `uv` binary as a fallback when automatic download is blocked or unavailable.
- Guide users from MCP and skill-related surfaces into Runtime Setup when managed runtimes are relevant.

## Non-goals

- No system-wide installation or mutation of the user’s shell profile.
- No attempt to fully emulate a complete Node.js or Python installation in v1.
- No background auto-downloads without user action.
- No requirement that every possible `node`, `python`, or arbitrary shell workflow work in v1.
- No bundling of fixed Bun or UV releases inside the app package.

## Product Direction

### Dedicated Runtime Setup

- Add a new settings page, `Runtime Setup`, that is the explicit entry point for installing or managing app-owned runtimes.
- The page should show separate cards for `bun` and `uv`.
- Each card should expose:
  - current status
  - installed version if available
  - source (`managed`, `custom`, or `none`)
  - last error if present
  - `Install latest`
  - `Use downloaded binary`
  - `Check again`
  - `Reinstall` or `Replace`

### Managed Latest-Release Installs

- When the user clicks `Install latest`, the main process should:
  - detect OS and architecture
  - fetch the latest GitHub release metadata
  - select the correct asset for the current platform
  - download the archive or binary
  - validate checksums if available
  - extract it into app-owned storage
  - set executable permissions where required
  - validate the installed binary with a version command
  - mark the runtime ready only after validation succeeds

### Custom Binary Support

- If automatic download is not viable, the user can choose a locally downloaded binary or archive.
- TIA Studio should validate the selected runtime before activating it.
- A custom runtime should be treated as first-class runtime state rather than a temporary override.

### Runtime-Aware MCP Launching

- MCP execution should continue to use the existing launch path in `src/main/mastra/assistant-runtime.ts`.
- Before handing stdio server definitions to Mastra, TIA Studio should resolve managed runtimes and normalize common commands.
- v1 command normalization should focus on the real target workflows:
  - `npx <pkg>` → managed `bunx <pkg>`
  - `bunx <pkg>` → managed `bunx <pkg>`
  - `uvx <tool>` → managed `uvx <tool>`
  - `bun ...` → managed `bun ...`
  - `uv ...` → managed `uv ...`
- Raw `node`, `python`, and `python3` commands should not be silently rewritten in v1. Instead, the runtime resolver should:
  - prepend app-managed runtime locations to the child-process environment where helpful
  - surface clear guided errors when the configured command still cannot be satisfied

## Architecture

### Main-process runtime manager

- Add a new main-process service, conceptually `ManagedRuntimeService`, responsible for:
  - loading and saving runtime state
  - GitHub release lookups
  - asset selection by platform
  - download and extraction
  - install validation
  - active binary switching
  - child-process runtime resolution helpers

- Add a small repository dedicated to runtime state. This should stay separate from `mcp.json` because MCP settings describe user intent, while runtime state describes app-managed executable availability.

### Persistence model

- Persist runtime state for `bun` and `uv` independently.
- Each runtime record should include fields equivalent to:
  - `source`: `managed | custom | none`
  - `binaryPath`
  - `version`
  - `installedAt`
  - `lastCheckedAt`
  - `releaseUrl`
  - `checksum`
  - `status`
  - `errorMessage`

- Use app-owned storage with stable active paths, for example:
  - `<appData>/runtimes/bun/<version>/...`
  - `<appData>/runtimes/uv/<version>/...`
  - `<appData>/bin/bun`
  - `<appData>/bin/bunx`
  - `<appData>/bin/uv`
  - `<appData>/bin/uvx`

- The resolver should always read from the stable active paths instead of hard-coding versioned directories. That allows atomic upgrades and easy fallback.

### Renderer integration

- Extend the preload bridge with runtime APIs so the renderer can:
  - read runtime status
  - check latest release information
  - install managed runtimes
  - pick custom binaries
  - clear or replace current runtime selections

- Add a `Runtime Setup` page under Settings and a matching sidebar entry.
- Add lightweight guidance in existing MCP and skill-related surfaces to route users into Runtime Setup instead of expecting them to know what Bun or UV are.

### MCP runtime resolution

- Centralize command normalization in `src/main/mastra/assistant-runtime.ts` so it remains the single source of truth for MCP launch behavior.
- Runtime resolution should:
  - inspect `command`, `args`, and `env`
  - rewrite supported commands to managed executables
  - prepend app-owned runtime locations to `PATH`
  - preserve user-provided args and environment
  - fail clearly when a required managed runtime is missing

## UX Flow

### Runtime Setup flow

1. User opens `Runtime Setup`.
2. The page loads persisted runtime state.
3. The user clicks `Install latest` or `Use downloaded binary`.
4. The main process performs install/validation work.
5. The page updates with success, version, and any recoverable warnings.

### MCP setup flow

1. User configures an MCP server.
2. If the command suggests Bun or UV usage, the settings page shows a helper CTA.
3. If required managed runtimes are missing, the UI guides the user to `Runtime Setup`.
4. Saving MCP settings remains possible, but launch-time errors should point back to Runtime Setup if setup is incomplete.

### Launch-time failure flow

- If runtime resolution cannot satisfy an MCP configuration, the app should produce a clear message such as:
  - `Managed Bun runtime is required for this MCP. Open Runtime Setup to install it.`

## Error Handling

- Distinguish at least these runtime statuses:
  - `missing`
  - `installing`
  - `ready`
  - `custom-ready`
  - `update-available`
  - `invalid-custom-path`
  - `download-failed`
  - `extract-failed`
  - `validation-failed`

- Persist the last known error so the user can see what failed after an app restart.
- If GitHub is unavailable:
  - do not break already installed runtimes
  - do not block MCPs that already work
  - do show a useful update-check or download error

## Security and Reliability Notes

- Never modify the user’s global shell configuration or system `PATH`.
- Prefer checksum verification when upstream releases expose checksum data.
- Validate binaries after install before marking them active.
- Keep the previous working managed runtime available until the replacement is confirmed healthy.
- Avoid guessing on ambiguous rewrites; explicit guided failure is safer than silent misexecution.

## Testing Strategy

- Add main-process tests for:
  - platform asset selection
  - persisted runtime-state normalization
  - managed/custom runtime validation
  - command normalization and env injection
  - GitHub/download/extract failure handling

- Add renderer tests for:
  - `Runtime Setup` page states
  - sidebar routing
  - MCP settings guidance banners or CTAs

- Add integration coverage that confirms:
  - managed runtimes are injected into MCP definitions
  - missing runtimes return guided launch errors

## Rollout Order

1. Create runtime persistence and main-process runtime manager scaffolding.
2. Expose runtime APIs through preload IPC.
3. Add the `Runtime Setup` settings page and navigation.
4. Add MCP guidance links into Runtime Setup.
5. Integrate managed runtime resolution into MCP launching.
6. Verify targeted tests, then broader regression coverage.
