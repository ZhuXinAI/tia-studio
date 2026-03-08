# Managed Runtimes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add app-managed Bun and UV runtime setup, expose it in Settings, and use those runtimes automatically when launching compatible MCP servers.

**Architecture:** Introduce a dedicated runtime repository and main-process service that manages latest-release installs and custom binary selection. Expose runtime operations through preload IPC, add a new renderer settings page for user-guided setup, and normalize MCP stdio commands in `assistant-runtime` so compatible servers prefer managed executables without modifying the user’s system environment.

**Tech Stack:** Electron 39, React 19, React Router 7, TypeScript 5, Vitest 4, Zod, Mastra MCP, Node.js filesystem/process APIs

---

## Execution rules

- Apply **TDD** per task (`red -> green -> refactor`).
- Keep changes focused; do not add unrelated runtime abstractions.
- Prefer targeted test runs before broader suites.
- Keep commits small and frequent (one commit per task when executing this plan).

---

### Task 1: Add runtime persistence primitives

**Files:**
- Create: `src/main/persistence/repos/managed-runtimes-repo.ts`
- Create: `src/main/persistence/repos/managed-runtimes-repo.test.ts`

**Step 1: Write the failing test**

Create `src/main/persistence/repos/managed-runtimes-repo.test.ts` with coverage for:

- default empty state when no file exists
- normalization of `bun` and `uv` runtime records
- persistence of `source`, `binaryPath`, `version`, `status`, and `errorMessage`

Test sketch:

```ts
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ManagedRuntimesRepository } from './managed-runtimes-repo'

describe('ManagedRuntimesRepository', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'tia-managed-runtimes-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns default runtime state when file is missing', async () => {
    const repo = new ManagedRuntimesRepository(path.join(tempDir, 'managed-runtimes.json'))
    const state = await repo.getState()

    expect(state.bun.status).toBe('missing')
    expect(state.uv.status).toBe('missing')
  })
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/main/persistence/repos/managed-runtimes-repo.test.ts
```

Expected: FAIL because the repository does not exist yet.

**Step 3: Write minimal implementation**

- Create `ManagedRuntimesRepository` with:
  - `getState()`
  - `saveState(input)`
- Normalize each runtime record to a predictable shape.
- Save JSON next to other app persistence files.

Implementation sketch:

```ts
export type ManagedRuntimeKind = 'bun' | 'uv'
export type ManagedRuntimeSource = 'managed' | 'custom' | 'none'
export type ManagedRuntimeStatus =
  | 'missing'
  | 'installing'
  | 'ready'
  | 'custom-ready'
  | 'update-available'
  | 'invalid-custom-path'
  | 'download-failed'
  | 'extract-failed'
  | 'validation-failed'

export type ManagedRuntimeRecord = {
  source: ManagedRuntimeSource
  binaryPath: string | null
  version: string | null
  installedAt: string | null
  lastCheckedAt: string | null
  releaseUrl: string | null
  checksum: string | null
  status: ManagedRuntimeStatus
  errorMessage: string | null
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/main/persistence/repos/managed-runtimes-repo.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/persistence/repos/managed-runtimes-repo.ts src/main/persistence/repos/managed-runtimes-repo.test.ts
git commit -m "feat: add managed runtime persistence"
```

---

### Task 2: Add runtime service release and validation logic

**Files:**
- Create: `src/main/runtimes/managed-runtime-service.ts`
- Create: `src/main/runtimes/managed-runtime-service.test.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing test**

Create `src/main/runtimes/managed-runtime-service.test.ts` with focused coverage for:

- selecting a GitHub release asset for current `os + arch`
- validating a custom runtime path by running `--version`
- surfacing `download-failed` or `validation-failed` when setup fails

Test sketch:

```ts
import { describe, expect, it } from 'vitest'
import { ManagedRuntimeService } from './managed-runtime-service'

describe('ManagedRuntimeService', () => {
  it('selects bun asset for darwin arm64', () => {
    const asset = ManagedRuntimeService.selectReleaseAsset(
      'bun',
      'darwin',
      'arm64',
      [{ name: 'bun-darwin-aarch64.zip', browser_download_url: 'https://example.test/bun.zip' }]
    )

    expect(asset?.browser_download_url).toContain('bun.zip')
  })
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/main/runtimes/managed-runtime-service.test.ts
```

Expected: FAIL because the runtime service does not exist yet.

**Step 3: Write minimal implementation**

- Create `ManagedRuntimeService` that composes the new repository.
- Add helpers for:
  - `getStatus()`
  - `checkLatest()`
  - `installManagedRuntime(kind)`
  - `setCustomRuntime(kind, selectedPath)`
  - `clearRuntime(kind)`
  - `resolveManagedCommand(...)`
- Keep network and extraction helpers small and injectable so tests can mock them.
- Register the service in `src/main/index.ts`, but do not wire renderer IPC yet.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/main/runtimes/managed-runtime-service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/runtimes/managed-runtime-service.ts src/main/runtimes/managed-runtime-service.test.ts src/main/index.ts
git commit -m "feat: add managed runtime service"
```

---

### Task 3: Expose runtime APIs through preload IPC

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Step 1: Write the failing test**

Add or extend preload typing coverage if present, or add a focused test near existing IPC integration that asserts runtime APIs are available on `window.tiaDesktop`.

Test sketch:

```ts
expect(window.tiaDesktop.getManagedRuntimeStatus).toBeTypeOf('function')
expect(window.tiaDesktop.installManagedRuntime).toBeTypeOf('function')
```

If there is no natural preload test harness, use this task to add type-safe API declarations first and verify with `npm run typecheck`.

**Step 2: Run verification to confirm the gap**

Run:

```bash
npm run typecheck
```

Expected: FAIL or missing declarations for the new runtime APIs.

**Step 3: Write minimal implementation**

- Add IPC handlers in `src/main/index.ts`:
  - `tia:get-managed-runtime-status`
  - `tia:check-managed-runtime-latest`
  - `tia:install-managed-runtime`
  - `tia:pick-custom-runtime`
  - `tia:clear-managed-runtime`
- Extend preload bridge and typings with matching methods.
- Reuse native dialog APIs for `pick-custom-runtime`.

**Step 4: Re-run verification**

Run:

```bash
npm run typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose managed runtime ipc"
```

---

### Task 4: Add Runtime Setup settings page and navigation

**Files:**
- Create: `src/renderer/src/features/settings/runtimes/managed-runtimes-query.ts`
- Create: `src/renderer/src/features/settings/pages/runtime-setup-page.tsx`
- Create: `src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx`
- Modify: `src/renderer/src/app/router.tsx`
- Modify: `src/renderer/src/features/settings/components/settings-sidebar-nav.tsx`
- Modify: `src/renderer/src/app/router.test.tsx`

**Step 1: Write the failing test**

Create `src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx` with coverage that:

- runtime cards render for `bun` and `uv`
- status text renders from query data
- install and custom-binary actions render

Extend `src/renderer/src/app/router.test.tsx` to verify `/settings/runtimes` resolves.

Test sketch:

```tsx
expect(container.textContent).toContain('Runtime Setup')
expect(container.textContent).toContain('bun')
expect(container.textContent).toContain('uv')
expect(container.textContent).toContain('Install latest')
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx src/renderer/src/app/router.test.tsx
```

Expected: FAIL because the page and route do not exist yet.

**Step 3: Write minimal implementation**

- Add a renderer query wrapper for the new preload APIs.
- Add `RuntimeSetupPage` with:
  - heading and description
  - Bun and UV status cards
  - buttons for `Install latest`, `Use downloaded binary`, `Check again`, `Clear custom`
- Add the new route to the settings router.
- Add a `Runtime Setup` nav entry in the settings sidebar.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx src/renderer/src/app/router.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/settings/runtimes/managed-runtimes-query.ts src/renderer/src/features/settings/pages/runtime-setup-page.tsx src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx src/renderer/src/app/router.tsx src/renderer/src/features/settings/components/settings-sidebar-nav.tsx src/renderer/src/app/router.test.tsx
git commit -m "feat: add runtime setup settings page"
```

---

### Task 5: Add MCP guidance into Runtime Setup

**Files:**
- Modify: `src/renderer/src/features/settings/pages/mcp-servers-settings-page.tsx`
- Modify: `src/renderer/src/features/settings/pages/mcp-servers-settings-page.test.tsx`
- Modify: `src/renderer/src/features/assistants/assistant-editor.tsx`
- Modify: `src/renderer/src/features/assistants/assistant-editor.test.tsx`

**Step 1: Write the failing test**

Add coverage that:

- MCP server editing shows a helper CTA when the command is `npx`, `bunx`, `uv`, `uvx`, or `bun`
- assistant tools view includes a link to `Runtime Setup` when no managed runtimes are configured for runtime-backed tools

Test sketch:

```tsx
expect(container.textContent).toContain('Runtime Setup')
expect(container.textContent).toContain('managed runtimes')
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/renderer/src/features/settings/pages/mcp-servers-settings-page.test.tsx src/renderer/src/features/assistants/assistant-editor.test.tsx
```

Expected: FAIL because there is no runtime guidance yet.

**Step 3: Write minimal implementation**

- Add a small helper detector for runtime-managed commands.
- In MCP settings, show a non-blocking callout with a link to `/settings/runtimes` when relevant.
- In the assistant tools view, add a concise note that some MCPs use app-managed runtimes and can be finished in Runtime Setup.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/renderer/src/features/settings/pages/mcp-servers-settings-page.test.tsx src/renderer/src/features/assistants/assistant-editor.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/features/settings/pages/mcp-servers-settings-page.tsx src/renderer/src/features/settings/pages/mcp-servers-settings-page.test.tsx src/renderer/src/features/assistants/assistant-editor.tsx src/renderer/src/features/assistants/assistant-editor.test.tsx
git commit -m "feat: guide users to runtime setup"
```

---

### Task 6: Normalize managed runtimes in MCP launching

**Files:**
- Modify: `src/main/mastra/assistant-runtime.ts`
- Create: `src/main/mastra/assistant-runtime.runtime-resolution.test.ts`

**Step 1: Write the failing test**

Create `src/main/mastra/assistant-runtime.runtime-resolution.test.ts` with coverage for:

- `npx -y @scope/pkg` resolving to managed `bunx`
- `uvx tool` resolving to managed `uvx`
- `bun run ...` resolving to managed `bun`
- missing managed runtime returning a guided error

Test sketch:

```ts
expect(definition.command).toBe('/managed/bin/bunx')
expect(definition.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem'])
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/main/mastra/assistant-runtime.runtime-resolution.test.ts
```

Expected: FAIL because runtime normalization is not implemented.

**Step 3: Write minimal implementation**

- Inject the runtime service or a narrow runtime resolver dependency into `AssistantRuntimeService`.
- Normalize stdio command definitions before returning `MastraMCPServerDefinition`.
- Preserve user args and env.
- Throw a clear `ChatRouteError` when a required managed runtime is unavailable.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test -- src/main/mastra/assistant-runtime.runtime-resolution.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/mastra/assistant-runtime.ts src/main/mastra/assistant-runtime.runtime-resolution.test.ts
git commit -m "feat: use managed runtimes for compatible mcps"
```

---

### Task 7: Verify runtime feature end-to-end

**Files:**
- Verify only:
  - `src/main/persistence/repos/managed-runtimes-repo.test.ts`
  - `src/main/runtimes/managed-runtime-service.test.ts`
  - `src/main/mastra/assistant-runtime.runtime-resolution.test.ts`
  - `src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx`
  - `src/renderer/src/features/settings/pages/mcp-servers-settings-page.test.tsx`
  - `src/renderer/src/features/assistants/assistant-editor.test.tsx`
  - `src/renderer/src/app/router.test.tsx`

**Step 1: Run focused verification**

Run:

```bash
npm run test -- src/main/persistence/repos/managed-runtimes-repo.test.ts src/main/runtimes/managed-runtime-service.test.ts src/main/mastra/assistant-runtime.runtime-resolution.test.ts src/renderer/src/features/settings/pages/runtime-setup-page.test.tsx src/renderer/src/features/settings/pages/mcp-servers-settings-page.test.tsx src/renderer/src/features/assistants/assistant-editor.test.tsx src/renderer/src/app/router.test.tsx
```

Expected: PASS

**Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Run broader regression pass**

Run:

```bash
npm run test -- src/main src/renderer/src/features/settings src/renderer/src/features/assistants
```

Expected: PASS, or only pre-existing unrelated failures outside managed runtime work.

**Step 4: Commit**

```bash
git add src/main src/preload src/renderer/src
git commit -m "feat: add managed runtime setup and mcp integration"
```
