# Approval and permission models: Claude Code, Codex, and Hermes Agent

Research date: 2026-07-19. Sources are first-party documentation and official
repositories. Source-code links are pinned to the inspected commits.

## Executive summary

- **Claude Code** has declarative `allow`, `ask`, and `deny` rules using
  tool-specific glob/prefix syntax. Current official permission rules do **not**
  document slash-delimited regular expressions. A remembered Bash approval is
  saved locally per Git repository; file-edit approval lasts only for the
  session.
- **Codex** uses Starlark `prefix_rule()` entries over a structured argv prefix,
  with `allow`, `prompt`, and `forbidden` decisions. The strictest matching
  decision wins. Accepted TUI allow suggestions are persisted to the user's
  `~/.codex/rules/default.rules`; project-local rules can also be supplied from
  trusted project configuration.
- **Hermes Agent** detects dangerous operations with built-in regexes, exposes
  user `deny` rules as case-insensitive `fnmatch` globs, and offers once,
  session, always, and deny choices. Permanent approvals live in the active
  Hermes home's `config.yaml`. Its own security policy explicitly says this
  in-process approval gate is a heuristic, not a security boundary.
- For TIA Studio, the strongest foundation is **Codex-style structured argv
  rules plus Claude-style workspace-local persistence and precedence**. Avoid
  user-authored regex as the primary mechanism, and never turn one approved
  command into a broad category approval automatically.

## Claude Code

### Schema and semantics

Claude Code settings contain `permissions.allow`, `permissions.ask`, and
`permissions.deny` arrays. Rules have the form `Tool` or `Tool(specifier)`, for
example `Bash(npm run *)`, `Read(./.env)`, and
`WebFetch(domain:example.com)`. Evaluation order is **deny, ask, allow**;
specificity does not override that order. Thus a broad deny or ask continues to
win over a narrower allow.

Source: [Configure permissions](https://code.claude.com/docs/en/permissions.md)
and [Settings](https://code.claude.com/docs/en/settings.md).

### Matching model

- Bash and PowerShell rules use `*` wildcard patterns. A trailing ` *` has a
  word-boundary meaning, while an unspaced trailing `*` can also match a longer
  executable name.
- This is glob/prefix matching, **not documented regex matching**. Therefore a
  rule such as `Bash(/git\\s+push.../)` from the supplied demo is not part of
  the current official permission-rule grammar. Regex-like validation belongs
  in a `PreToolUse` hook if it is truly needed.
- Claude parses compound shell commands and checks subcommands independently.
  Approving `git status && npm test` can save separate rules for the subcommands
  that needed approval (up to five rules).
- It strips a fixed set of wrappers (`timeout`, `time`, `nice`, `nohup`,
  `stdbuf`, and bare `xargs`) before matching. Other runners such as `npx`,
  `docker exec`, `direnv exec`, and `devbox run` are not transparently trusted;
  rules should include both runner and intended inner command.
- Read/Edit path rules use gitignore-style path patterns rather than Bash
  patterns.

Source: [Permission rule syntax, compound commands, and process wrappers](https://code.claude.com/docs/en/permissions.md#permission-rule-syntax).

### Remembered approvals and scope

For Bash, “Yes, don't ask again” is persisted in
`.claude/settings.local.json` at the Git repository's main-checkout root, and
applies to future sessions in that repository, including subdirectories and
worktrees. Outside a repository it is saved relative to the starting directory.
File-modification approval is session-only. The `/permissions` UI shows rules
and their source files.

Settings also support user, project, local, and managed scopes. Project rules
can be committed; local rules are personal and normally gitignored.

Source: [Claude permission system](https://code.claude.com/docs/en/permissions.md#permission-system)
and [settings scopes](https://code.claude.com/docs/en/settings.md#settings-files).

### Security caveats

Anthropic warns that Bash patterns intended to constrain arguments are fragile:
option ordering, redirects, variables, alternate protocols, and spacing can
defeat the intended restriction. It recommends dedicated tools (for example
domain-scoped `WebFetch`) or `PreToolUse` hooks for stronger validation. File
deny rules cover recognized built-in/file commands, not arbitrary Node or
Python subprocess file access; OS-level sandboxing is needed for that boundary.
Even `bypassPermissions` retains a small root/home deletion circuit breaker.

Source: [Bash permission warning](https://code.claude.com/docs/en/permissions.md#bash)
and [sandboxing](https://code.claude.com/docs/en/sandboxing.md).

## OpenAI Codex

### Schema and semantics

Codex `.rules` files are Starlark. The primary primitive is:

```python
prefix_rule(
    pattern = ["gh", "pr", ["view", "list"]],
    decision = "prompt",
    justification = "Review GitHub data before unsandboxed access",
    match = ["gh pr view 7888"],
    not_match = ["gh issue view 7888"],
)
```

`pattern` is a non-empty argv prefix. Each position is either an exact literal
or a list of literal alternatives. It is not regex or shell glob matching.
Decisions are `allow`, `prompt`, and `forbidden`; when rules overlap, Codex
chooses the most restrictive result: `forbidden > prompt > allow`. `match` and
`not_match` are load-time inline tests.

Source: [Codex Rules](https://learn.chatgpt.com/docs/agent-configuration/rules.md),
[Starlark parser](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/execpolicy/src/parser.rs),
and [decision ordering](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/execpolicy/src/decision.rs).

### Compound commands and wrappers

For `bash -c`, `bash -lc`, and equivalent `sh`/`zsh` wrappers, Codex uses
tree-sitter to split a script only when it is a linear chain of plain words
joined by `&&`, `||`, `;`, or `|`. Each resulting argv is evaluated and the
strictest result wins. Advanced forms such as redirects, substitutions,
variables, wildcards, and control flow are not split; the whole shell-wrapper
argv is evaluated conservatively as one invocation.

The runtime source implements this in
[`commands_for_exec_policy`](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/core/src/exec_policy.rs#L803-L840)
and the word-only parser in
[`shell-command/src/bash.rs`](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/shell-command/src/bash.rs#L21-L125).
The suggestion path also rejects dangerously broad proposed prefixes such as a
bare shell/interpreter, `sudo`, `env`, or bare `git`, although an administrator
should still avoid manually writing broad wrapper allows.

### Remembered approvals and scope

Codex scans `rules/` directories under active configuration layers. The TUI's
accepted allow-list suggestion is appended to
`~/.codex/rules/default.rules`, so it is user-global. Project-local
`<repo>/.codex/rules/` files load only when that project configuration layer is
trusted. Administrators can enforce restrictive rules through managed
requirements.

The runtime append/update path is in
[`core/src/exec_policy.rs`](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/core/src/exec_policy.rs#L390-L446).

Rules control when commands may run **outside the sandbox**; they complement,
not replace, sandbox policy. Proposed reusable rules are checked to ensure they
would approve all parsed command segments before being offered.

### Testing rules

`codex execpolicy check --rules <file> -- <argv...>` loads one or more rule
files and prints the matched rules and strictest decision as JSON. This should
be mirrored by any TIA rule editor with positive and negative examples.

Source: [Rules: test a rule file](https://learn.chatgpt.com/docs/agent-configuration/rules.md#test-a-rule-file)
and [execpolicy check implementation](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/execpolicy/src/execpolicycheck.rs).

## Hermes Agent

### Product identity

“Hermes Agent” is ambiguous in the abstract. This section assumes the user
means the actively maintained official repository
[`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent).
If another Hermes product was intended, its repository or product URL is
needed before applying these conclusions.

### Configuration and modes

The active Hermes home's `config.yaml` supports:

```yaml
approvals:
  mode: smart       # manual | smart | off
  timeout: 60
  cron_mode: deny   # deny | approve
  deny:
    - "git push --force*"
    - "*curl*|*sh*"

command_allowlist: []
```

`smart` is the default and uses an auxiliary LLM to auto-approve a low-risk
flagged command; `manual` prompts; `off` bypasses recoverable prompts. Cron jobs
default to denying dangerous commands because no user is present.

Source: [Hermes configuration defaults](https://github.com/NousResearch/hermes-agent/blob/e598cef87465981fcea1c0339edfcf5d9716c917/hermes_cli/config.py#L2640-L2682).

### Detection, matching, and precedence

- Shipped dangerous and hardline command detectors are Python regexes in
  [`tools/approval.py`](https://github.com/NousResearch/hermes-agent/blob/e598cef87465981fcea1c0339edfcf5d9716c917/tools/approval.py).
- User `approvals.deny` entries are **case-insensitive `fnmatch` globs**, matched
  over normalized/deobfuscated command variants. They run before YOLO or
  `mode: off`, so a user deny cannot be bypassed by those modes.
- A small hardline blocklist (for example catastrophic host destruction) is
  checked before every bypass and cannot be approved.
- `command_allowlist` accepts exact command text or shell-style `fnmatch`
  wildcards. Its direct command shortcut refuses commands containing newlines,
  `&&`, `||`, separators, pipes, redirects, backticks, or `$()`.
- Isolated container backends skip these guards unless host paths are mounted;
  the default local backend does not.

Source: [user deny matching](https://github.com/NousResearch/hermes-agent/blob/e598cef87465981fcea1c0339edfcf5d9716c917/tools/approval.py#L526-L561),
[permanent command matching](https://github.com/NousResearch/hermes-agent/blob/e598cef87465981fcea1c0339edfcf5d9716c917/tools/approval.py#L2201-L2233),
and [guard ordering](https://github.com/NousResearch/hermes-agent/blob/e598cef87465981fcea1c0339edfcf5d9716c917/tools/approval.py#L3188-L3230).

### Remembered approvals and scope

The prompt returns `once`, `session`, `always`, or `deny`. Session approvals
are stored in memory under a session key and cleared at session boundaries.
“Always” adds entries to `command_allowlist` in the active
`~/.hermes/config.yaml` (or configured `HERMES_HOME`) and therefore is not
repository-scoped by this subsystem.

An important difference from Codex/Claude: an automatically persisted
dangerous-command approval is generally keyed by the detector's category
description, such as `recursive delete`, rather than a freshly derived argv
prefix. That can approve later commands in the same broad category. Manually
authored command-text/glob entries are also supported. Tirith content-security
warnings cannot be permanently approved; smart-deny owner overrides are
one-operation only; smart auto-approval is also command-only.

Source: [approval prompt outcomes](https://github.com/NousResearch/hermes-agent/blob/e598cef87465981fcea1c0339edfcf5d9716c917/tools/approval.py#L2273-L2420),
[session/permanent state](https://github.com/NousResearch/hermes-agent/blob/e598cef87465981fcea1c0339edfcf5d9716c917/tools/approval.py#L2015-L2255),
and [persistence behavior](https://github.com/NousResearch/hermes-agent/blob/e598cef87465981fcea1c0339edfcf5d9716c917/tools/approval.py#L3377-L3612).

### Security caveats

Hermes explicitly states that the **only security boundary against an
adversarial LLM is OS-level isolation**. Its approval scanner is an in-process
heuristic over attacker-influenced shell text, useful for preventing mistakes
but structurally incomplete. The source also preserves a historical fail-open
path for dangerous commands in non-interactive, non-gateway, non-cron contexts;
plugin-escalated actions choose fail-closed instead.

Source: [Hermes security policy](https://github.com/NousResearch/hermes-agent/blob/e598cef87465981fcea1c0339edfcf5d9716c917/SECURITY.md#L44-L136)
and [shared approval gate](https://github.com/NousResearch/hermes-agent/blob/e598cef87465981fcea1c0339edfcf5d9716c917/tools/approval.py#L2638-L2745).

## Recommended TIA Studio design

1. Model rules as structured data: tool, executable, argv prefix (each token a
   literal or literal union), working-directory/workspace scope, decision,
   origin, and timestamps. Do not store executable user regex as the default
   format.
2. Use precedence `hard block > deny > ask > allow`; within the same decision,
   rule specificity should affect display/diagnostics, not weaken precedence.
3. Offer **Deny**, **Allow once**, **Allow for session**, and **Always allow in
   this workspace**. Make global approval a separate advanced action, not the
   default “always”.
4. Derive a remembered rule from parsed argv and show the exact proposed prefix
   before saving. Never persist a risk-category label such as “recursive
   delete” as an allow rule.
5. Split only provably simple shell chains, evaluate every segment, and use the
   strictest decision. For redirects, substitutions, variables, wildcards,
   heredocs, or control flow, prompt for the whole invocation and do not offer
   an automatically derived reusable rule.
6. Reject broad auto-suggestions for shells, interpreters, `sudo`, `env`,
   package installers, destructive commands, and runners capable of executing
   arbitrary inner commands. Allow experts to author them only with an explicit
   warning and negative test cases.
7. Add a permission-rule manager showing source/scope, last use, rationale, and
   revoke controls, plus an `execpolicy check`-style simulator with match and
   non-match examples.
8. Keep enforcement in the Electron main process and pair it with the OS
   sandbox/credential boundary. Renderer UI and regex scanners are not security
   boundaries.

