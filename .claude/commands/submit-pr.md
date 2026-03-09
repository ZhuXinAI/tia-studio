Create a new branch from the latest origin/main, commit all changes, and submit a PR.

## Steps

1. **Check working tree status**: Run `git status` and `git diff` to confirm there are changes. This includes both uncommitted changes (staged + unstaged) and any commits on the current branch that are not on origin/main. If the working tree is completely clean and there are no new commits beyond origin/main, inform the user and stop.

2. **Analyze changes**: Read all changed files (both uncommitted and already-committed) to understand the purpose of the changes.

3. **Collect uncommitted changes**: If there are uncommitted changes (staged or unstaged), stash them with `git stash --include-untracked` so they can be carried over to the new branch.

4. **Collect existing commits**: If there are commits on the current branch that are not on origin/main, note them down. They will be cherry-picked onto the new branch.

5. **Create branch**:
   - `git fetch origin main`
   - Generate a semantic branch name using the appropriate prefix (`feat/`, `fix/`, `docs/`, `chore/`, `refactor/`) based on the type of change, followed by a short description (lowercase words joined by hyphens)
   - `git checkout -b <prefix>/short-description origin/main`

6. **Apply collected changes**:
   - If there were existing commits (from step 4), cherry-pick them onto the new branch
   - If there was a stash (from step 3), apply it with `git stash pop`
   - If cherry-pick or stash pop causes conflicts, inform the user and stop

7. **Check if documentation needs updating**:
   Per the "Maintenance" section in CLAUDE.md, check whether any of the following docs need to be updated:
   - `CLAUDE.md` — if the changes involve new API routes, new libs, new conventions, or new gotchas
   - `docs/claws.md` — if the changes involve channels, assistant activation, channel abstraction layer, or external integrations (Lark, Telegram, etc.)

   If any docs need updating, complete the updates before proceeding. If the changes don't involve API changes or new conventions, skip this step.

8. **Commit code**:
   - `git add` only the relevant files (do not use `git add -A`)
   - Write a concise English commit message based on the changes
   - `git commit`
   - If all changes were already committed via cherry-pick and there's nothing new to commit, skip this step

9. **Push and create PR**:
   - `git push -u origin HEAD`
   - Use `gh pr create` to create a PR targeting `main`
   - PR title should be concise (<70 chars), body should include Summary and Test plan

10. **Return the PR URL** to the user.

## Notes

- Branch names and commit messages must be in English
- Always create a new branch from origin/main, regardless of which branch you are currently on
- If conflicts occur at any step, inform the user and stop
- Never use `git add -A` or `git add .` — only add relevant files by name
