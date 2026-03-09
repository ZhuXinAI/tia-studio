Review the GitHub PR: $ARGUMENTS

## Instructions

You are performing a systematic code review on the given PR. Follow the process below strictly.

### Step 0: Fetch PR Data

Use `gh` CLI to gather all information:

```bash
gh pr view <PR_URL> --json number,title,body,author,baseRefName,headRefName,state,reviewDecision,statusCheckRollup,labels,files,additions,deletions
gh pr diff <PR_URL>
gh pr checks <PR_URL>
```

If the PR URL is a number, treat it as a PR in the current repo. If it's a full URL, use it directly.

### Step 1: Context Gathering (Phase 1)

Before reading any code, understand:

1. **PR description** — What is this change trying to do? What problem does it solve?
2. **Linked issues** — Check the PR body for issue references
3. **CI status** — Are checks passing? Note any failures
4. **PR size** — If >400 lines changed, note this as a concern
5. **Base branch** — What branch is this targeting?

### Step 2: High-Level Review (Phase 2)

Review the overall diff and assess:

1. **Architecture & Design** — Does the solution fit the problem? Is it consistent with existing patterns? Are there simpler approaches?
2. **File Organization** — Are new files in the right places? Is code grouped logically?
3. **Testing Strategy** — Are there tests? Do they cover edge cases? Are they readable?
4. **Dependencies** — Any new dependencies added? Are they justified?

### Step 3: Line-by-Line Review (Phase 3)

For each changed file, examine:

1. **Logic & Correctness** — Edge cases, off-by-one errors, null/undefined checks, race conditions
2. **Security** — Input validation, injection risks (SQL, XSS, command), sensitive data exposure, auth checks
3. **Performance** — N+1 queries, unnecessary loops, memory leaks, blocking operations
4. **Maintainability** — Clear naming, single-responsibility functions, appropriate comments, no magic numbers
5. **Error Handling** — Are errors caught and handled appropriately? Do error messages leak internal info?

Read the actual source files (not just the diff) when you need surrounding context to understand a change.

### Step 4: Documentation Sync Check

This project requires documentation to stay in sync with code changes. Check if the PR updates all relevant docs per the "API changes -> update all agent docs" rule in CLAUDE.md:

- `CLAUDE.md` — Project conventions and schema
- `docs/claws.md` — Channel abstraction layer, assistant-channel management, external integrations (Lark, Telegram, etc.)

Flag missing doc updates if the PR changes API routes, params, or features that are documented in these surfaces.

### Step 5: Summary & Verdict (Phase 4)

Output a structured review report using this format:

```
## PR Review: <title>

**PR**: #<number> by @<author>
**Branch**: <head> -> <base>
**Size**: +<additions> -<deletions> across <file_count> files
**CI**: <passing/failing/pending>

---

### Strengths

- [What was done well — use praise labels]

### Issues Found

For each issue, use severity labels:
- **[blocking]** — Must fix before merge
- **[important]** — Should fix, discuss if disagree
- **[nit]** — Nice to have, not blocking
- **[suggestion]** — Alternative approach to consider
- **[praise]** — Good work, keep it up

### Documentation Status

- [Which docs need updating, if any]

### Security Checklist

- [ ] User input validated and sanitized
- [ ] No injection vulnerabilities (SQL, XSS, command)
- [ ] Auth/authz checks in place
- [ ] No hardcoded secrets
- [ ] Error messages don't leak internal info

### Verdict

One of:
- **APPROVE** — Good to merge (with optional nits)
- **COMMENT** — Minor suggestions, non-blocking
- **REQUEST CHANGES** — Must address blocking issues before merge
```

### Step 6: Fix, Confirm, and Merge

After presenting the review report, follow this decision tree:

**If there are [blocking] issues**: Do NOT merge. Present the report and let the author address them.

**If there are no [blocking] issues**:

1. **[nit] issues and missing doc updates** — Fix these directly without asking. Check out the PR branch, commit fixes, push.

2. **[important] and [suggestion] issues** — List them and ask the user whether to fix now or defer. Wait for the user's decision before proceeding. Only fix the ones the user approves.

3. After all approved fixes are committed and pushed, merge the PR using `gh pr merge <PR_URL> --merge --delete-branch`.