# Skills.sh, Pi skill loading, and Grok UI research

Research captured on 2026-07-18 (Asia/Shanghai). Rankings and install counts are live data and will change.

## Executive findings

- `skills.sh` has a documented JSON API. The correct way to obtain the current top 20 is `GET /api/v1/skills?view=all-time&per_page=20`, not scraping the rendered cards. The API currently requires a Vercel OIDC bearer token and allows 600 requests/minute per team/project.
- The skill detail endpoint returns a content snapshot: a SHA-256 `hash` plus every file in the skill folder as `{ path, contents }`. This is sufficient for TIA Studio to perform its own reviewed, atomic installation into a TIA-owned global skill directory. The official `skills` CLI is the other supported install path.
- Pi does progressive disclosure. It discovers and validates skill metadata at startup, adds only each skill's name, description, and path to the system prompt, and expects the model to read the full `SKILL.md` only when a task matches. The SDK example's `skillsOverride` is the intended hook for filtering discovered skills or adding TIA-owned synthetic skills before creating the session.
- The Grok screenshot is useful as interaction/design evidence, but current xAI documentation does not document the screenshot's web actions (“Write skill manually”, “Upload skill file”, “Create skill with Grok”). xAI does document a unified extensions modal in the Grok Build TUI and a separate connector catalog that includes custom MCP servers. Do not treat the screenshot-only actions as an xAI API contract.

## 1. Current skills.sh top 20

The skills.sh home page was queried on 2026-07-18 and its embedded all-time leaderboard data gave the following order. Prefer refreshing this list from the API at runtime; these counts are only a dated snapshot.

| Rank | Skill ID                        | Source                      | Installs in snapshot |
| ---: | ------------------------------- | --------------------------- | -------------------: |
|    1 | `find-skills`                   | `vercel-labs/skills`        |            2,559,128 |
|    2 | `frontend-design`               | `anthropics/skills`         |              677,536 |
|    3 | `grill-me`                      | `mattpocock/skills`         |              589,016 |
|    4 | `vercel-react-best-practices`   | `vercel-labs/agent-skills`  |              560,599 |
|    5 | `agent-browser`                 | `vercel-labs/agent-browser` |              556,072 |
|    6 | `grill-with-docs`               | `mattpocock/skills`         |              498,165 |
|    7 | `improve-codebase-architecture` | `mattpocock/skills`         |              486,099 |
|    8 | `web-design-guidelines`         | `vercel-labs/agent-skills`  |              472,135 |
|    9 | `tdd`                           | `mattpocock/skills`         |              466,614 |
|   10 | `microsoft-foundry`             | `microsoft/azure-skills`    |              463,543 |
|   11 | `azure-ai`                      | `microsoft/azure-skills`    |              460,067 |
|   12 | `azure-deploy`                  | `microsoft/azure-skills`    |              459,766 |
|   13 | `azure-diagnostics`             | `microsoft/azure-skills`    |              459,616 |
|   14 | `azure-prepare`                 | `microsoft/azure-skills`    |              459,460 |
|   15 | `azure-storage`                 | `microsoft/azure-skills`    |              459,148 |
|   16 | `azure-validate`                | `microsoft/azure-skills`    |              458,815 |
|   17 | `entra-app-registration`        | `microsoft/azure-skills`    |              458,700 |
|   18 | `appinsights-instrumentation`   | `microsoft/azure-skills`    |              458,620 |
|   19 | `azure-compliance`              | `microsoft/azure-skills`    |              458,541 |
|   20 | `azure-resource-lookup`         | `microsoft/azure-skills`    |              458,534 |

Primary source: [skills.sh live all-time leaderboard](https://skills.sh/).

### Official catalog API

The documented endpoint for the UI is:

```http
GET https://skills.sh/api/v1/skills?view=all-time&per_page=20
Authorization: Bearer <VERCEL_OIDC_TOKEN>
```

Useful response fields are `id` (`{source}/{slug}`), `slug`, `name`, `source`, `installs`, `sourceType`, `installUrl`, `url`, and optional `isDuplicate`. The API docs explicitly recommend stable `id` values for install detection and recommend filtering `isDuplicate: true` when an app wants to show originals only. Leaderboard responses cache for roughly 30–60 seconds.

The API's documented authentication is Vercel OIDC. A Vercel-hosted backend should obtain a request-scoped token with `@vercel/oidc`'s `getVercelOidcToken()` and pass it as a bearer token. A desktop client should not assume this endpoint is anonymously callable or embed a bearer token. A TIA-controlled backend/proxy is the cleaner production boundary if TIA cannot mint Vercel OIDC itself.

Primary source: [skills.sh API reference](https://skills.sh/docs/api).

### Official download/install mechanisms

There are two supported mechanisms:

1. **Retrieve the snapshot through the API.** `GET /api/v1/skills/{source}/{skill}` returns `id`, `source`, `slug`, `installs`, a SHA-256 `hash`, and `files`, where each file contains its relative `path` and full textual `contents`. For a TIA-owned installer, validate that every path remains inside a newly created skill directory, write into a temporary directory, verify that `SKILL.md` exists and parses, then atomically move the directory into the global TIA skills root. Use `hash` for update/cache invalidation. The API also exposes `/api/v1/skills/audit/{source}/{skill}`; audits can be missing (`404`) and are not a substitute for reviewing executable skill content.
2. **Use the official CLI.** The canonical command is `npx skills add <source>`. For one skill in a multi-skill repository and Pi's global location, the non-interactive form is:

   ```bash
   npx skills add owner/repo --skill skill-id -g -a pi -y
   ```

   The CLI accepts GitHub shorthand, full/direct GitHub URLs, GitLab URLs, any git URL, and local paths. It can symlink (recommended by that project) or copy (`--copy`). Its documented Pi targets are `.pi/skills/` for project scope and `~/.pi/agent/skills/` for global scope.

There is no separately documented “download zip/bundle” endpoint. The detail endpoint's `files` snapshot is the official API-level bundle representation; otherwise installation is source/CLI based.

Primary sources:

- [skills.sh API detail and audit endpoints](https://skills.sh/docs/api)
- [Vercel skills CLI README](https://github.com/vercel-labs/skills#readme)

## 2. How Pi loads skills

### What the SDK example does

The referenced `04-skills.ts` example:

1. Constructs a `DefaultResourceLoader` with the current working directory and `getAgentDir()`.
2. Supplies `skillsOverride`, which receives the already discovered `{ skills, diagnostics }` set.
3. Filters discovered skills and merges in an inline `Skill` with synthetic source metadata.
4. Calls `await loader.reload()`.
5. Reads the final result using `loader.getSkills()`.
6. Passes the same loader to `createAgentSession`, so the filtered/augmented skill set is the one exposed to the session.

Primary source: [earendil-works/pi SDK example 04-skills.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/04-skills.ts).

### Discovery, validation, precedence, and prompting

Pi's current first-party docs list these sources:

- Global: `~/.pi/agent/skills/` and `~/.agents/skills/`.
- Project, after project trust: `.pi/skills/`, plus `.agents/skills/` in the current directory and ancestors up to the git root (or filesystem root outside a repo).
- Package-provided `skills/` directories or `pi.skills` entries.
- Explicit settings paths and repeatable CLI `--skill <path>` arguments.

The low-level loader recursively discovers directories containing `SKILL.md`; a directory containing `SKILL.md` is treated as one skill root and is not traversed further. It follows usable symlinks, skips hidden directories and `node_modules`, and respects `.gitignore`, `.ignore`, and `.fdignore`. A missing/blank description prevents loading. Invalid name shape, excessive name/description length, and collisions produce diagnostics; the first skill with a given name wins.

The system prompt does **not** contain every full skill. `formatSkillsForPrompt()` emits XML entries containing name, description, and absolute file location, with an instruction to use the read tool when a task matches. Skills marked `disable-model-invocation: true` are omitted from that prompt and remain explicitly invocable through `/skill:<name>`. This is the key architectural behavior to preserve in TIA: install complete folders on disk, but only expose lightweight metadata until the model selects a skill.

`getAgentDir()` defaults to `~/.pi/agent`, but the package supports an app-specific `${APP_NAME}_CODING_AGENT_DIR` environment override. TIA can therefore keep a TIA-owned global root and pass it as `agentDir`/the package's app-specific environment instead of writing into Codex, Claude, or another product's directories.

Primary sources:

- [Pi skills documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)
- [Pi skill discovery and prompt formatting source](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/skills.ts)
- [Pi resource loader source](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/resource-loader.ts)
- [Pi config and agent-directory source](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/config.ts)

### Concrete recommendation for TIA Studio

- Treat one installed skill as an owned directory, not just a copied `SKILL.md`; scripts, references, and assets are part of the package.
- Keep **global TIA skills** in the agent directory supplied to TIA's Pi `DefaultResourceLoader`, under its `skills/` child.
- Keep **workspace skills** under the workspace's `.pi/skills/` (or an explicitly TIA-named path added via `additionalSkillPaths`). They should be loaded only for a trusted workspace.
- After install/remove/update, invoke `reload()` and replace the renderer list from `getSkills()`; do not claim success based only on the download response.
- Surface `diagnostics` to the UI. A downloaded skill with no description will not become usable, and name collisions keep the earlier skill.
- Preserve a source ID, snapshot hash, and install scope in TIA metadata so the top-20 catalog can show Installed/Update states without guessing from display names.

## 3. What can and cannot be grounded from Grok

### Screenshot-supported UI behavior

The supplied screenshot directly shows:

- One page titled “Skills and Connectors”.
- Peer tabs for “Skills” and “Connectors”.
- A “Personal” skill section rendered as a two-column list of compact skill cards.
- A “New Skill” menu with “Write skill manually”, “Upload skill file”, and “Create skill with Grok”.

These are valid design observations from the provided image. They are not evidence of public xAI endpoints or exact persistence/install semantics.

### Behavior supported by current xAI docs

xAI's current connector docs support a closely related tab model:

- Connectors are available inside conversations and come in three groups: xAI-maintained built-ins, a catalog of preconfigured OAuth connectors, and custom MCP connectors.
- Built-in/catalog connectors are added from `grok.com/connectors` through “New Connector” and OAuth.
- A custom connector is created by selecting “Custom”, entering a publicly reachable MCP server URL, and completing any required authentication; Grok discovers the server's tools and can use them in conversations.
- Current built-ins include Gmail/Google Calendar, Google Drive, OneDrive, Outlook Mail/Calendar, Teams, SharePoint, and Salesforce. The catalog also documents examples such as Box, GitHub, Linear, Notion, and Vercel.

Separately, the Grok Build CLI docs say skills are reusable folders of markdown, scripts, and resources; global skills live under `~/.grok/skills/`, project skills under `.grok/skills/`, and user-invocable skills become slash commands. Grok Build exposes `/skills` and `/mcps` as entry points to one extensions modal. That supports grouping Skills and MCPs in one settings surface, but it describes the Grok Build TUI, not necessarily the grok.com screenshot.

Primary sources:

- [xAI Grok connectors overview](https://docs.x.ai/grok/connectors.md)
- [xAI Grok connector management](https://docs.x.ai/grok/connector-management.md)
- [xAI Grok Build skills, plugins, and marketplaces](https://docs.x.ai/build/features/skills-plugins-marketplaces.md)

### Product boundary for TIA

For the requested TIA page, label the tabs according to TIA's actual data model. If the carried-over page configures raw MCP servers, “Skills” and “MCPs” is precise. If it will also own OAuth app connections, “Skills” and “Connectors” is the broader Grok-like model, with MCP as one connector type. In either case, TIA should implement its own CRUD and persistence instead of presenting the screenshot's xAI actions as if they were available APIs.
