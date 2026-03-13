# macOS Notarization Trial Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a temporary GitHub Actions workflow and supporting build hooks to verify macOS notarization works for release builds before merging the changes into the main release pipeline.

**Architecture:** Keep the existing release workflows untouched while introducing a dedicated manual workflow on a throwaway branch. Wire notarization through Electron Builder in a way that can be enabled for the trial job, then use GitHub Actions logs and artifacts to validate signing, notarization, and stapling end to end.

**Tech Stack:** GitHub Actions, Electron Builder, Electron notarization, macOS code signing, Node.js

---

### Task 1: Document the current release and secret state

**Files:**

- Modify: `RELEASE.md`
- Test: manual GitHub CLI inspection

**Step 1: Record the current workflow and secret expectations**

Check the existing release workflows and note which secret names are referenced for code signing and notarization.

**Step 2: Verify what the repository can actually access**

Run: `gh secret list --repo ZhuXinAI/tia-studio`
Expected: the visible repo-level secrets list appears and can be compared with the workflow requirements.

**Step 3: Capture the result in release documentation if needed**

Document any required notarization secrets that must exist for the temporary workflow to function.

**Step 4: Commit**

```bash
git add RELEASE.md
git commit -m "docs: note macos notarization secret requirements"
```

### Task 2: Add a dedicated notarization hook for macOS packaging

**Files:**

- Create: `build/notarize.mjs`
- Modify: `electron-builder.yml`
- Test: `pnpm run build:mac`

**Step 1: Add a no-op-safe notarization script**

Create a build hook that exits early unless the build is running on macOS and the expected notarization credentials are present.

**Step 2: Register the hook with Electron Builder**

Attach the new hook without changing the Windows or Linux build paths.

**Step 3: Verify local packaging still works without notarization credentials**

Run: `pnpm run build:mac`
Expected: packaging succeeds locally or reaches signing-related checks without crashing because notarization credentials are absent.

**Step 4: Commit**

```bash
git add build/notarize.mjs electron-builder.yml
git commit -m "build: add macos notarization hook"
```

### Task 3: Add a temporary manual GitHub Actions workflow

**Files:**

- Create: `.github/workflows/notarize-trial.yml`
- Test: GitHub Actions workflow lint via push and manual dispatch

**Step 1: Create a workflow_dispatch-only macOS workflow**

Clone the existing macOS release setup, but keep it isolated from tags and releases so it can be rerun safely on a trial branch.

**Step 2: Add explicit notarization diagnostics**

Include steps that print certificate identities, verify the built app with `codesign`, check Gatekeeper with `spctl`, and validate stapling after the build.

**Step 3: Upload the signed artifacts and logs**

Preserve the DMG, ZIP, and any generated notarization diagnostics so failures can be debugged from the run page.

**Step 4: Commit**

```bash
git add .github/workflows/notarize-trial.yml
git commit -m "ci: add macos notarization trial workflow"
```

### Task 4: Run the workflow on a dedicated branch and iterate

**Files:**

- Modify: `.github/workflows/notarize-trial.yml`
- Modify: `build/notarize.mjs`
- Modify: `electron-builder.yml`
- Test: GitHub Actions manual runs

**Step 1: Create and push a dedicated branch**

Run: `git checkout -b codex/macos-notarize-trial`
Expected: a clean working branch is created without disturbing `main`.

**Step 2: Push and dispatch the workflow**

Run: `gh workflow run notarize-trial.yml --ref codex/macos-notarize-trial`
Expected: the manual workflow starts on GitHub Actions.

**Step 3: Inspect the run output and fix the first real failure**

Use `gh run view --log` to identify whether the blocker is missing credentials, signing identity selection, notarization upload, entitlements, or stapling.

**Step 4: Repeat until the workflow completes successfully**

Each iteration should fix a single failure mode and rerun the workflow.

**Step 5: Commit**

```bash
git add .github/workflows/notarize-trial.yml build/notarize.mjs electron-builder.yml
git commit -m "fix: stabilize macos notarization trial"
```

### Task 5: Open a PR with the isolated trial changes

**Files:**

- Modify: `RELEASE.md`
- Test: PR diff review

**Step 1: Summarize the exact conditions required for success**

Document the final secret names, workflow behavior, and verification commands.

**Step 2: Push the final branch**

Run: `git push -u origin codex/macos-notarize-trial`
Expected: the branch is available remotely for PR creation.

**Step 3: Open the PR**

Run: `gh pr create --fill`
Expected: a PR is created containing only the isolated trial changes.

**Step 4: Commit**

```bash
git add RELEASE.md
git commit -m "docs: capture macos notarization trial results"
```
