# CLAW and Structure Docs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add reader-facing `CLAW.md` and `STRUCTURE.md`, link them from `README.md`, and prepare a `v0.1.9` release commit/tag.

**Architecture:** Keep the existing low-level claw documentation in `docs/` and add two narrative explainers at the repository root. Update the README in-place so readers can move from the brief overview into deeper architecture docs without changing the existing app structure.

**Tech Stack:** Markdown, JSON, Git

---

### Task 1: Add the design and implementation docs

**Files:**

- Create: `docs/plans/2026-03-10-claw-and-structure-docs-design.md`
- Create: `docs/plans/2026-03-10-claw-and-structure-docs.md`

**Step 1: Write the design note**

Document:

- the approved root-level doc approach,
- the intended audience,
- the sections each new document will cover,
- the README link updates,
- the planned release version bump to `0.1.9`.

**Step 2: Save the implementation plan**

Include:

- the exact files to create and modify,
- the release/tagging work,
- the verification commands.

**Step 3: Review the plan for scope**

Check that the plan stays limited to:

- documentation,
- README links,
- version alignment,
- release commit/tag/push.

**Step 4: Commit later with the final docs**

Do not create a plan-only commit. Fold these files into the final documentation release commit.

### Task 2: Write `CLAW.md`

**Files:**

- Create: `CLAW.md`
- Reference: `docs/claws.md`
- Reference: `src/main/mastra/assistant-runtime.ts`
- Reference: `src/main/mastra/store.ts`
- Reference: `src/main/mastra/tools/channel-tools.ts`
- Reference: `src/main/channels/channel-service.ts`
- Reference: `src/main/channels/channel-message-router.ts`
- Reference: `src/main/server/routes/claws-route.ts`
- Reference: `src/main/persistence/repos/assistants-repo.ts`
- Reference: `src/main/persistence/repos/channels-repo.ts`

**Step 1: Draft the narrative outline**

Cover:

- what a claw is,
- why the app models it as assistant + channel,
- how Mastra is used in the runtime,
- how inbound and outbound channel traffic moves,
- how scheduled work still belongs to the assistant.

**Step 2: Add the main implementation walkthrough**

Explain the flow in prose:

1. the claws UI saves assistant and channel data,
2. the claws API composes those records,
3. channel services reload runtime adapters,
4. inbound events are routed into assistant threads,
5. the Mastra-powered assistant runtime streams a reply,
6. the event bus sends the response back to the channel.

**Step 3: Add a “read next” section**

Point readers to:

- `docs/claws.md` for lower-level details,
- the main runtime files for source reading.

**Step 4: Keep it explain-first**

Avoid turning the document into a route reference or an exhaustive file dump.

### Task 3: Write `STRUCTURE.md`

**Files:**

- Create: `STRUCTURE.md`
- Reference: `src/main/index.ts`
- Reference: `src/main/server/create-app.ts`
- Reference: `src/renderer/src/app/router.tsx`

**Step 1: Describe the top-level source layout**

Explain the roles of:

- `src/main`
- `src/renderer/src`
- `src/preload`
- `src/test`

**Step 2: Walk each main folder**

For `src/main`, cover folders such as:

- `channels`
- `cron`
- `heartbeat`
- `mastra`
- `persistence`
- `server`
- `default-agent`
- `runtimes`
- `skills`

For `src/renderer/src`, cover folders such as:

- `app`
- `features`
- `components`
- `lib`
- `i18n`
- `assets`

**Step 3: Add a cross-stack feature flow**

Explain how a typical change moves through:

- React UI,
- API client,
- Hono routes,
- repositories and services,
- runtime systems in the main process.

**Step 4: Keep generated folders out**

Do not document `dist/`, `out/`, or other generated output areas.

### Task 4: Update the README and release version

**Files:**

- Modify: `README.md`
- Modify: `package.json`

**Step 1: Link `CLAW.md` from the claws section**

Add a short line that positions `CLAW.md` as the longer architecture explainer.

**Step 2: Link `STRUCTURE.md` from the project structure section**

Add a short line that positions `STRUCTURE.md` as the fuller source-tree walkthrough.

**Step 3: Bump the package version**

Change:

```json
"version": "0.1.8"
```

to:

```json
"version": "0.1.9"
```

Keep the change limited to the package manifest.

### Task 5: Verify, commit, tag, and push

**Files:**

- Modify: `CLAW.md`
- Modify: `STRUCTURE.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `docs/plans/2026-03-10-claw-and-structure-docs-design.md`
- Modify: `docs/plans/2026-03-10-claw-and-structure-docs.md`

**Step 1: Run formatting verification**

Run:

```bash
pnpm exec prettier --check README.md CLAW.md STRUCTURE.md package.json docs/plans/2026-03-10-claw-and-structure-docs-design.md docs/plans/2026-03-10-claw-and-structure-docs.md
```

Expected:

- `All matched files use Prettier code style!`

**Step 2: Review the staged diff**

Run:

```bash
git diff -- README.md CLAW.md STRUCTURE.md package.json docs/plans/2026-03-10-claw-and-structure-docs-design.md docs/plans/2026-03-10-claw-and-structure-docs.md
```

Expected:

- only the planned documentation and version updates appear.

**Step 3: Commit**

Run:

```bash
git add README.md CLAW.md STRUCTURE.md package.json docs/plans/2026-03-10-claw-and-structure-docs-design.md docs/plans/2026-03-10-claw-and-structure-docs.md
git commit -m "docs: add claw and structure explainers"
```

Expected:

- a single commit that contains the docs update and version bump.

**Step 4: Tag the release**

Run:

```bash
git tag -a v0.1.9 -m "v0.1.9"
```

Expected:

- annotated tag `v0.1.9` points at the docs release commit.

**Step 5: Push to `main`**

Run:

```bash
git push origin main
git push origin v0.1.9
```

Expected:

- `main` is updated remotely,
- the new release tag is available on `origin`.
