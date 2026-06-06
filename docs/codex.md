Below is a **detailed UI description/spec** for recreating a Codex-like desktop app in Electron, excluding login. This is based on OpenAI’s public Codex app docs and launch materials, so treat it as a high-fidelity product interpretation rather than a guaranteed pixel-perfect reverse-engineering. The public docs describe Codex as a desktop “command center” for running multiple agent threads in parallel, organized by projects, with worktree support, terminal, Git review, skills, automations, browser/computer use, and settings.

---

# 1. Overall app mental model

The app is not mainly an IDE. It is closer to a **multi-agent operations console**.

The hierarchy is:

```txt
App
 ├── Global sidebar
 │    ├── Projects
 │    ├── Threads per project
 │    ├── Skills
 │    ├── Automations
 │    ├── Settings
 │    └── Account / profile area
 │
 ├── Main workspace
 │    ├── Project / thread view
 │    ├── Chat / agent activity timeline
 │    ├── Composer
 │    ├── Terminal
 │    └── Review / diff / artifacts side panel
 │
 └── Floating / modal surfaces
      ├── Command palette
      ├── New thread composer
      ├── Approval dialogs
      ├── Skill picker
      ├── Automation editor
      ├── Browser preview
      └── Settings panel
```

The core UX promise is: **run multiple coding agents at once, keep each task isolated, supervise progress, review changes, and ship from the same app**. OpenAI describes the app as a focused desktop experience for working on Codex threads in parallel, with built-in worktree support, automations, and Git functionality. ([OpenAI 开发者][1])

---

# 2. Main app shell

## 2.1 Window frame

For Electron, use a custom window shell with:

```txt
┌──────────────────────────────────────────────────────────────┐
│  traffic lights / window controls       command/search area  │
├───────────────┬─────────────────────────────┬────────────────┤
│               │                             │                │
│ Left sidebar  │ Main thread / project view  │ Right panel    │
│               │                             │                │
└───────────────┴─────────────────────────────┴────────────────┘
```

Recommended visual style:

```txt
Background: very dark or light neutral depending on theme
Surface: slightly elevated panels
Borders: subtle 1px separators
Corners: 8–14px radius
Typography: clean sans-serif for UI, mono for code
Density: compact but not cramped
```

Codex settings publicly include appearance customization: base theme, accent color, background/foreground colors, UI font, and code font. ([OpenAI 开发者][2])

---

# 3. First useful screen after login: project selection / main page

Since login is excluded, the app should open directly into a **project launcher** when no project is selected.

## 3.1 Empty / initial main page

Layout:

```txt
┌──────────────────────────────────────────────────────────────┐
│ Sidebar                                                      │
│ ┌───────────────┐  ┌──────────────────────────────────────┐  │
│ │ Codex logo    │  │ Let’s code                           │  │
│ │               │  │                                      │  │
│ │ + New project │  │ Choose a project folder to start.    │  │
│ │ Recent        │  │                                      │  │
│ │ Settings      │  │ [ Open folder ] [ Connect remote ]   │  │
│ │ Profile       │  │                                      │  │
│ └───────────────┘  │ Recent projects                      │  │
│                    │ ┌──────────────────────────────────┐ │  │
│                    │ │ project-name      ~/path/to/repo │ │  │
│                    │ │ another-app       ~/code/app     │ │  │
│                    │ └──────────────────────────────────┘ │  │
│                    └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

Public docs say the getting-started flow is: download app, sign in, select a project folder, then send the first message. If the user used Codex app/CLI/IDE before, past projects appear. ([OpenAI 开发者][1])

## 3.2 Project card

Each project card should include:

```txt
Project name
Path
Git branch or repo state
Last active time
Open threads count
Status badges:
  • Running
  • Needs approval
  • Ready for review
  • Idle
```

Example:

```txt
┌──────────────────────────────────────────────┐
│ speechify-windows                            │
│ ~/code/speechify-windows                     │
│ main · 3 threads · last used 14m ago         │
│ [Running] [1 approval needed]                │
└──────────────────────────────────────────────┘
```

## 3.3 Project actions

Primary actions:

```txt
Open folder
Create project
Open recent
Connect remote host
Import from CLI sessions
```

The docs mention local projects and remote connections; the desktop app can detect SSH hosts from SSH config and create projects/run threads inside remote machines. ([OpenAI][3])

---

# 4. Sidebar

The sidebar is the backbone of the app.

## 4.1 Sidebar sections

Suggested structure:

```txt
┌─────────────────────────────┐
│ Codex                       │
│ [ + New Thread ]            │
│                             │
│ Projects                    │
│   speechify-windows         │
│   primehire-agent           │
│   tia-board                 │
│                             │
│ Current Project             │
│   ◉ Add paste detection     │
│   ◌ Refactor auth flow      │
│   ▲ Fix failing tests       │
│   ✓ Update README           │
│                             │
│ Workspace                   │
│   Skills                    │
│   Automations               │
│   Review queue              │
│   Browser                   │
│                             │
│ Bottom                      │
│   Settings                  │
│   Profile                   │
└─────────────────────────────┘
```

## 4.2 Sidebar behavior

The sidebar should support:

```txt
Collapse / expand
Project switching
Thread switching
Thread status badges
Thread pinning
Thread archiving
Context menu per thread
Search / filter
```

OpenAI docs mention users can ask Codex to find related threads, continue an existing thread, pin or archive a thread, and create separate background threads. ([OpenAI 开发者][4])

## 4.3 Thread status indicators

Use simple visual states:

```txt
Idle
Running
Waiting for approval
Needs user input
Ready for review
Errored
Committed / shipped
Archived
```

Suggested icons:

```txt
● running
▲ approval needed
? needs input
✓ done
! failed
```

---

# 5. Project page

After selecting a project, the main view should show the selected project and its threads.

## 5.1 Project home layout

```txt
┌──────────────────────────────────────────────────────────────┐
│ Project: speechify-windows                    [New Thread]   │
├──────────────────────────────────────────────────────────────┤
│ Ask Codex to work in this project                            │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ What do you want to change, inspect, fix, or build?      │ │
│ └──────────────────────────────────────────────────────────┘ │
│ [Local] [Worktree] [Cloud]                      [Send ⏎]     │
│                                                              │
│ Active threads                                               │
│ ┌───────────────┬─────────────┬──────────────┬────────────┐ │
│ │ Thread        │ Mode        │ Status       │ Last update│ │
│ │ Fix paste     │ Worktree    │ Running      │ 2m ago     │ │
│ │ Add tests     │ Local       │ Needs review │ 1h ago     │ │
│ └───────────────┴─────────────┴──────────────┴────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## 5.2 New thread composer

Codex supports thread modes: **Local**, **Worktree**, and **Cloud**. Local works directly in the current project directory; Worktree isolates changes in a Git worktree; Cloud runs in a configured cloud environment. ([OpenAI 开发者][4])

Composer mode UI:

```txt
┌──────────────────────────────────────────────┐
│ What should Codex do?                        │
│ ┌──────────────────────────────────────────┐ │
│ │ Find why ctrl+v paste detection is flaky │ │
│ │ and propose a robust architecture.       │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ Mode                                         │
│ (●) Local       Edit current folder          │
│ ( ) Worktree    Isolated Git worktree        │
│ ( ) Cloud       Remote/cloud environment     │
│                                              │
│ Context                                      │
│ [Attach image] [Add files] [Use skill]       │
│                                              │
│ [Cancel]                         [Start]     │
└──────────────────────────────────────────────┘
```

## 5.3 Composer details

The composer should support:

```txt
Plain text prompt
Markdown
Code blocks
Image drag-and-drop
File attachment
Skill mention
Slash commands
Mode selector
Send button
Multiline prompt behavior
```

Docs mention image input via drag-and-drop into the prompt composer. ([OpenAI 开发者][4]) Settings also include an option to require `Cmd+Enter` for multiline prompts. ([OpenAI 开发者][2])

Suggested slash commands:

```txt
/skill
/personality
/pet
/terminal
/browser
/review
/commit
/help
```

OpenAI’s launch post mentions `/personality`, and settings docs mention `/pet`. ([OpenAI][5])

---

# 6. Thread page

This is the most important screen.

## 6.1 Thread layout

```txt
┌────────────────────────────────────────────────────────────────────┐
│ Thread title                         [Terminal] [Review] [⋯]       │
│ Project / branch / mode / status                                   │
├───────────────────────────────┬────────────────────────────────────┤
│                               │                                    │
│ Main conversation timeline    │ Right panel                         │
│                               │ Plan / files / diff / artifacts     │
│                               │                                    │
├───────────────────────────────┴────────────────────────────────────┤
│ Composer                                                           │
│ [Ask Codex a follow-up…] [Attach] [Mode] [Send]                    │
└────────────────────────────────────────────────────────────────────┘
```

## 6.2 Thread header

Header should include:

```txt
Thread title
Project name
Mode badge: Local / Worktree / Cloud
Git branch or worktree name
Status
Elapsed time
Token / activity indicator if desired
Controls:
  Terminal
  Browser
  Review
  More menu
```

Example:

```txt
Fix paste success detection
speechify-windows · Worktree · codex/fix-paste-detection · Running
[Terminal] [Review changes] [Open in editor] [⋯]
```

The app supports reviewing changes in the thread, commenting on diffs, and opening changes in an editor. ([OpenAI][5])

---

# 7. Conversation / activity timeline

The central thread view should be a hybrid between chat, task log, and agent trace.

## 7.1 Message types

Support these message cards:

```txt
User prompt
Assistant response
Plan card
Tool call card
Command execution card
File edit card
Approval request
Error card
Summary card
Git diff card
Review result card
Automation result card
```

## 7.2 Agent plan card

```txt
┌──────────────────────────────────────────────┐
│ Plan                                         │
│ 1. Inspect paste insertion flow              │
│ 2. Trace active textarea detection           │
│ 3. Add clipboard verification fallback       │
│ 4. Write integration tests                   │
└──────────────────────────────────────────────┘
```

## 7.3 Command execution card

```txt
┌──────────────────────────────────────────────┐
│ Ran command                                  │
│ npm test                                     │
│                                              │
│ Output                                       │
│ 12 passed, 1 failed                          │
│                                              │
│ [Show full output] [Copy]                    │
└──────────────────────────────────────────────┘
```

Settings include control over how much command output appears in threads. ([OpenAI 开发者][2])

## 7.4 Approval request

Security and approvals are important. The Codex app uses sandboxing and asks for permission for commands requiring elevated permissions such as network access. ([OpenAI][5])

```txt
┌──────────────────────────────────────────────┐
│ Approval needed                              │
│ Codex wants to run:                          │
│ npm install playwright                       │
│                                              │
│ Reason: Required to add browser tests.       │
│                                              │
│ [Deny] [Allow once] [Always allow in project]│
└──────────────────────────────────────────────┘
```

## 7.5 Completion card

```txt
┌──────────────────────────────────────────────┐
│ Ready for review                             │
│ Codex changed 7 files, added 14 tests,       │
│ and fixed the paste detection race.          │
│                                              │
│ [Review diff] [Run tests] [Commit]           │
└──────────────────────────────────────────────┘
```

---

# 8. Composer inside thread

Bottom composer should be persistent.

```txt
┌──────────────────────────────────────────────────────────────┐
│ Ask Codex a follow-up…                                      │
│                                                              │
│ [ + ] [Image] [Skill] [Mention file]      Local ▾   Send     │
└──────────────────────────────────────────────────────────────┘
```

Features:

```txt
Multiline input
Markdown support
Drag-and-drop image/file
Mode awareness
Mention files
Mention previous thread
Mention terminal output
Mention browser selection/comment
Send with Enter or Cmd+Enter depending on settings
```

---

# 9. Right panel: artifacts / sources / review

OpenAI docs mention sidebar and artifacts for plans, sources, task summaries, and generated file previews. ([OpenAI 开发者][1])

## 9.1 Right panel tabs

```txt
Plan
Files
Diff
Terminal
Browser
Artifacts
Summary
```

## 9.2 Plan tab

Shows current task plan and progress.

```txt
Plan
✓ Inspect dictation flow
✓ Identify paste race condition
● Implement active-element verification
○ Add fallback paste event listener
○ Add tests
```

## 9.3 Files tab

```txt
Changed files
M src/paste/PasteController.ts
M src/input/ActiveElementTracker.ts
A tests/paste-detection.spec.ts
```

## 9.4 Artifacts tab

For generated files, previews, images, documents, reports, etc.

```txt
Artifacts
┌──────────────────────────────┐
│ paste-detection-report.md    │
│ Generated 4m ago             │
│ [Preview] [Open]             │
└──────────────────────────────┘
```

---

# 10. Git review / diff UI

Codex has built-in Git tools. The diff pane shows Git diffs, supports inline comments, and can stage or revert chunks/files; the app can commit, push, and create PRs. ([OpenAI 开发者][4])

## 10.1 Review page layout

```txt
┌──────────────────────────────────────────────────────────────┐
│ Review changes                         [Commit] [Push] [PR]  │
├───────────────────┬──────────────────────────────────────────┤
│ Changed files     │ Diff viewer                              │
│                   │                                          │
│ M Paste.ts        │ - old line                               │
│ M Tracker.ts      │ + new line                               │
│ A test.spec.ts    │                                          │
│                   │ [Comment] [Stage hunk] [Revert hunk]     │
└───────────────────┴──────────────────────────────────────────┘
```

## 10.2 File list

Each file row:

```txt
Status marker: M/A/D/R
File path
Additions/deletions
Checkbox/stage status
```

## 10.3 Diff viewer

Features:

```txt
Unified or split diff
Syntax highlighting
Inline comments
Stage hunk
Revert hunk
Stage file
Revert file
Open in editor
Ask Codex to address comment
```

## 10.4 Commit panel

```txt
┌──────────────────────────────────────────────┐
│ Commit message                               │
│ Fix paste success detection race             │
│                                              │
│ Description                                  │
│ - Track focused element before dictation     │
│ - Verify paste event target                  │
│ - Add timeout fallback                       │
│                                              │
│ [Regenerate] [Commit]                        │
└──────────────────────────────────────────────┘
```

Settings include Git configuration for standardized branch naming, force push behavior, and prompts Codex uses to generate commit messages and PR descriptions. ([OpenAI 开发者][2])

---

# 11. Integrated terminal

Each thread includes a built-in terminal scoped to the current project or worktree. Docs say it can be toggled with the terminal icon or `Cmd+J`; Codex can also read current terminal output. ([OpenAI 开发者][4])

## 11.1 Terminal placement

Two good options:

### Bottom drawer

```txt
┌──────────────────────────────────────────────┐
│ Thread content                               │
├──────────────────────────────────────────────┤
│ Terminal                                     │
│ $ npm test                                   │
│ ...                                          │
└──────────────────────────────────────────────┘
```

### Right panel tab

```txt
Right panel → Terminal
```

## 11.2 Terminal features

```txt
Multiple tabs
Default shell selection
Project/worktree scoped cwd
Copy output
Clear
Kill process
Ask Codex about output
Pin terminal output to context
```

Settings include where terminal tabs open by default. ([OpenAI 开发者][2])

---

# 12. Worktree UI

Worktree mode is central.

## 12.1 Worktree thread badge

```txt
Worktree · codex/add-tests · isolated
```

## 12.2 Worktree details panel

```txt
Worktree
Branch: codex/fix-paste-detection
Path: ~/code/project/.worktrees/fix-paste-detection
Base: main
Status: 7 files changed

[Open folder]
[Open in editor]
[Merge back]
[Delete worktree]
```

Docs describe worktree mode as creating a Git worktree so changes stay isolated from the regular project. ([OpenAI 开发者][4])

---

# 13. Skills page

Codex has a dedicated interface to create and manage skills; skills can be used across app, CLI, and IDE extension. ([OpenAI][5]) The app also supports viewing/exploring skills from the sidebar. ([OpenAI 开发者][4])

## 13.1 Skills list

```txt
┌──────────────────────────────────────────────────────────────┐
│ Skills                                      [Create Skill]   │
├──────────────────────────────────────────────────────────────┤
│ Search skills…                                                │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ build-web-game                                           │ │
│ │ Build and validate browser games                         │ │
│ │ Project skill · Enabled                                  │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ implement-figma-design                                   │ │
│ │ Fetch design context and implement UI                    │ │
│ │ Team skill · Enabled                                     │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## 13.2 Skill detail

```txt
Skill name
Description
Source: user / project / team / marketplace
Status: enabled / disabled
Files included
Instructions preview
Allowed tools
Last updated
Used by recent threads

[Enable/Disable]
[Edit]
[Duplicate]
[Reveal in folder]
[Use in new thread]
```

## 13.3 Create skill flow

```txt
Create Skill
 ├── Name
 ├── Description
 ├── Instructions
 ├── Resources
 ├── Scripts / commands
 ├── Tool permissions
 └── Save
```

---

# 14. Automations page

Codex supports automations that run background scheduled tasks; results land in a review queue. ([OpenAI][5]) Docs also mention automation creation with schedule and prompt fields. ([OpenAI 开发者][4])

## 14.1 Automations list

```txt
┌──────────────────────────────────────────────────────────────┐
│ Automations                                [New Automation]  │
├──────────────────────────────────────────────────────────────┤
│ Daily CI triage                                              │
│ Runs every weekday at 9:00 AM · Last run succeeded           │
│ [Run now] [Edit]                                             │
│                                                              │
│ Weekly dependency audit                                      │
│ Runs every Monday · Needs review                             │
│ [Review result] [Edit]                                       │
└──────────────────────────────────────────────────────────────┘
```

## 14.2 Automation creation form

```txt
New Automation

Name
[ Daily issue triage ]

Project
[ speechify-windows ▾ ]

Schedule
[ Every weekday ] [ 09:00 ]

Prompt
[ Check recent CI failures, summarize likely causes, and propose fixes. ]

Mode
( ) Local
(●) Worktree
( ) Cloud

Skills
[ + Add skill ]

Result handling
[ ] Notify me
[ ] Open review automatically
[ ] Create PR when tests pass

[Cancel] [Create Automation]
```

---

# 15. Review queue

Since automation results land in a review queue, implement a global queue.

```txt
Review queue
┌──────────────────────────────────────────────┐
│ Daily CI triage                              │
│ Automation result · 6 changes · Needs review │
│ [Open] [Dismiss]                             │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ Fix flaky screenshot test                    │
│ Thread result · 2 files changed              │
│ [Open] [Commit]                              │
└──────────────────────────────────────────────┘
```

---

# 16. Browser / in-app preview

The Codex app has an in-app browser for opening rendered pages, leaving comments, and letting Codex operate local browser flows. ([OpenAI 开发者][1])

## 16.1 Browser panel

```txt
┌──────────────────────────────────────────────────────────────┐
│ Browser                                     [Reload] [⋯]     │
│ http://localhost:3000                                       │
├──────────────────────────────────────────────────────────────┤
│ Rendered web page                                            │
└──────────────────────────────────────────────────────────────┘
```

## 16.2 Browser comment mode

```txt
[Comment mode enabled]

Click an element → comment box:

┌──────────────────────────────┐
│ This button is misaligned.   │
│ [Send to Codex]              │
└──────────────────────────────┘
```

## 16.3 Browser permissions

Browser use settings manage the bundled browser plugin, Chrome extension, and allowed/blocked websites. Codex asks before using a website unless it has been allowed. ([OpenAI 开发者][2])

---

# 17. Computer use / appshot UI

Codex supports computer use, appshots, and desktop-app access settings. Public docs describe computer use as allowing Codex to view screen content, take screenshots, and interact with windows, menus, keyboard input, and clipboard state in the target app. ([OpenAI 开发者][6])

## 17.1 Computer use prompt card

```txt
Codex wants to view and interact with another app.

Target app: Chrome
Capabilities:
✓ View screen
✓ Click
✓ Type
✓ Read clipboard state

[Cancel] [Allow]
```

## 17.2 Appshot card

```txt
Appshot added
Chrome — localhost:3000
Screenshot + visible text attached to thread

[Preview] [Remove]
```

Docs mention Appshots as sending the frontmost Mac app window to Codex with a screenshot and available text. ([OpenAI 开发者][1])

---

# 18. Notifications

By default, the app sends notifications when a task completes or needs approval while the app is in the background; settings can make notifications never show or always show even when the app is focused. ([OpenAI 开发者][4])

Notification examples:

```txt
Codex needs approval
“Fix paste detection” wants to run npm install.

Codex is ready for review
“Add keyboard shortcut tests” changed 4 files.
```

---

# 19. Command palette

Codex uses `Cmd+K` / `Ctrl+K` for command palette behavior in docs, including reload skills and pet commands. ([OpenAI 开发者][2])

## 19.1 Palette UI

```txt
┌──────────────────────────────────────────────┐
│ Search commands…                             │
├──────────────────────────────────────────────┤
│ New thread                                   │
│ Open settings                                │
│ Toggle terminal                              │
│ Review changes                               │
│ Force reload skills                          │
│ Wake Pet                                     │
│ Tuck Away Pet                                │
└──────────────────────────────────────────────┘
```

## 19.2 Palette behavior

```txt
Fuzzy search
Keyboard-first
Shows shortcut hints
Shows project/thread-aware commands
Can run skill commands
Can open settings sections directly
```

---

# 20. Settings page

OpenAI docs say Settings can be opened from the app menu or with `Cmd + ,`. Settings tune app behavior, file opening, tool connections, appearance, Git, MCP, browser use, computer use, personalization, and context-aware suggestions. ([OpenAI 开发者][2])

## 20.1 Settings shell

Use a two-column settings layout.

```txt
┌──────────────────────────────────────────────────────────────┐
│ Settings                                                     │
├──────────────────────┬───────────────────────────────────────┤
│ General              │ General                               │
│ Profile              │                                       │
│ Keyboard shortcuts   │ content area                          │
│ Notifications        │                                       │
│ Agent configuration  │                                       │
│ Appearance           │                                       │
│ Git                  │                                       │
│ Integrations & MCP   │                                       │
│ Browser use          │                                       │
│ Computer Use         │                                       │
│ Personalization      │                                       │
│ Suggestions          │                                       │
└──────────────────────┴───────────────────────────────────────┘
```

---

## 20.2 Settings > General

Public docs describe General as controlling where files open, command output amount, terminal tab defaults, multiline prompt send behavior, and preventing sleep while a thread runs. ([OpenAI 开发者][2])

Suggested UI:

```txt
General

File opening
Open files in:
[ System default editor ▾ ]
Options:
  System default
  VS Code
  Cursor
  Windsurf
  JetBrains
  Custom command

Command output
Show command output in threads:
[ Compact ▾ ]
Options:
  Minimal
  Compact
  Full

Terminal
Open terminal tabs:
[ In bottom drawer ▾ ]
Options:
  Bottom drawer
  Right panel
  New app tab

Composer
[ ] Require Cmd+Enter to send multiline prompts

Power
[ ] Prevent sleep while threads are running
```

---

## 20.3 Settings > Profile

Docs say Profile shows activity insights, lifetime tokens, peak tokens, streaks, longest task, token activity, and lets users update picture, display name, username, and save a profile card. ([OpenAI 开发者][2])

Suggested UI:

```txt
Profile

Avatar
[ image ]

Display name
[ Hu Tong ]

Username
[ hutong531 ]

Usage highlights
Lifetime tokens: 23.4M
Peak task: 1.2M tokens
Current streak: 7 days
Longest task: 4h 12m
Most active project: speechify-windows

[Save profile card]
```

---

## 20.4 Settings > Keyboard shortcuts

Docs say users can review commands, change bindings, reset shortcuts, search by command name, or switch to keystroke search. ([OpenAI 开发者][2])

Suggested UI:

```txt
Keyboard shortcuts

[ Search commands… ] [Search by keystroke]

Command                         Shortcut
New thread                       Cmd+N
Open command palette             Cmd+K
Open settings                    Cmd+,
Toggle terminal                  Cmd+J
Review changes                   Cmd+Shift+R
Send message                     Enter
Send multiline                   Cmd+Enter

[Reset all shortcuts]
```

Editing shortcut:

```txt
┌──────────────────────────────┐
│ Change shortcut              │
│ Command: Toggle terminal     │
│ Press new key combination…   │
│                              │
│ [Cancel] [Save]              │
└──────────────────────────────┘
```

---

## 20.5 Settings > Notifications

Docs say notification settings control when turn-completion notifications appear and whether the app should prompt for notification permissions. ([OpenAI 开发者][2])

Suggested UI:

```txt
Notifications

Task notifications
[ When app is in background ▾ ]
Options:
  Never
  When app is in background
  Always

Notify me when:
[✓] Thread completes
[✓] Approval is needed
[✓] Automation result is ready
[✓] Long-running task fails

System permission
Notifications: Enabled
[Open system settings]
```

---

## 20.6 Settings > Agent configuration

Docs say Codex agents inherit the same configuration as the IDE and CLI extension; common settings can be controlled in-app, while advanced options live in `config.toml`. ([OpenAI 开发者][2])

Suggested UI:

```txt
Agent configuration

Default model
[ GPT-5.5 Codex ▾ ]

Default mode
[ Local ▾ ]

Sandbox
[ Workspace write ▾ ]
Options:
  Read only
  Workspace write
  Full access with approvals

Approvals
[ Ask before network / external commands ▾ ]

Web search
[ Cached web search ▾ ]
Options:
  Disabled
  Cached
  Live

Advanced
Config file:
~/.codex/config.toml

[Open config.toml]
[Reload configuration]
```

Docs mention web search is enabled by default for local tasks and may use cached results unless sandbox is configured for full access. ([OpenAI 开发者][4])

---

## 20.7 Settings > Appearance

Docs say Appearance allows base theme, accent/background/foreground colors, UI/code fonts, and sharing custom themes. ([OpenAI 开发者][2])

Suggested UI:

```txt
Appearance

Theme
(●) System
( ) Light
( ) Dark

Accent color
[ color swatches ]

Background
[ color picker ]

Foreground
[ color picker ]

UI font
[ Inter ▾ ]

Code font
[ JetBrains Mono ▾ ]

Font size
[ 13 px ]

Theme actions
[Import theme]
[Export theme]
[Reset]
```

---

## 20.8 Settings > Appearance > Pets

Docs describe Codex pets as optional animated companions. Users can choose built-in pets, refresh custom pets from local Codex home, use `/pet`, or run Wake Pet / Tuck Away Pet from Settings or command palette. The overlay shows active thread state, whether Codex is running, waiting for input, or ready for review. ([OpenAI 开发者][2])

Suggested UI:

```txt
Pets

[ ] Enable Codex pet

Choose pet
┌────────┐ ┌────────┐ ┌────────┐
│ Cat    │ │ Bot    │ │ Blob   │
└────────┘ └────────┘ └────────┘

Custom pets
[Refresh custom pets]

Overlay behavior
[✓] Show active thread
[✓] Show running / waiting / review state
[✓] Show short progress prompt

Actions
[Wake Pet]
[Tuck Away Pet]
```

Overlay example:

```txt
┌──────────────────────────────┐
│ 🐾 Fix paste detection       │
│ Running · editing tests      │
│ “I found a flaky edge case.” │
└──────────────────────────────┘
```

---

## 20.9 Settings > Git

Docs say Git settings standardize branch naming, choose whether Codex uses force pushes, and set prompts for commit messages and PR descriptions. ([OpenAI 开发者][2])

Suggested UI:

```txt
Git

Branch naming
Prefix
[ codex/ ]

Branch name style
[ task-summary-kebab-case ▾ ]

Force push
[ ] Allow Codex to force push

Commit messages
Prompt used to generate commit messages:
┌──────────────────────────────────────────┐
│ Write concise imperative commit messages │
│ with a short body when useful.           │
└──────────────────────────────────────────┘

Pull request descriptions
Prompt:
┌──────────────────────────────────────────┐
│ Include summary, test plan, and risks.   │
└──────────────────────────────────────────┘

[Save]
```

---

## 20.10 Settings > Integrations & MCP

Docs say this page connects external tools via MCP, enables recommended servers, adds custom servers, starts OAuth when required, and stores MCP config in `config.toml`, shared with CLI and IDE extension. ([OpenAI 开发者][2])

Suggested UI:

```txt
Integrations & MCP

Recommended servers
┌──────────────────────────────────────────────┐
│ GitHub MCP                         [Enable] │
│ Linear MCP                         [Enable] │
│ Figma MCP                          [Enable] │
└──────────────────────────────────────────────┘

Custom MCP servers
┌──────────────────────────────────────────────┐
│ local-hermes-agent                           │
│ Command: node ~/mcp/hermes.js                │
│ Status: Connected                            │
│ [Edit] [Disable]                             │
└──────────────────────────────────────────────┘

[Add MCP server]
[Open config.toml]
```

Add server modal:

```txt
Add MCP server

Name
[ linear-local ]

Transport
(●) stdio
( ) HTTP
( ) SSE

Command / URL
[ npx @modelcontextprotocol/server-linear ]

Environment variables
[ + Add variable ]

[Cancel] [Save]
```

---

## 20.11 Settings > Browser use

Docs say Browser Use settings install/enable the bundled browser plugin, set up the Chrome extension, and manage allowed/blocked websites; Codex asks before using a website unless it is allowed. ([OpenAI 开发者][2])

Suggested UI:

```txt
Browser use

Bundled browser plugin
Status: Enabled
[Disable]

Chrome extension
Status: Not installed
[Install extension]

Website permissions
Allowed websites
  localhost:3000
  github.com
  linear.app

Blocked websites
  bank.example.com

[Add allowed site]
[Remove selected]
```

Permission dialog:

```txt
Codex wants to use github.com

[Block] [Allow once] [Always allow]
```

---

## 20.12 Settings > Computer Use

Docs say Computer Use settings let users review desktop-app access and preferences after setup; on macOS, system-level access can be revoked through Screen Recording or Accessibility permissions, and the feature is unavailable in some regions at launch. ([OpenAI 开发者][2])

Suggested UI:

```txt
Computer Use

Status
Screen recording: Enabled
Accessibility: Enabled
Clipboard access: Ask each time

Allowed apps
  Chrome
  Terminal
  VS Code

Blocked apps
  Password manager
  Banking apps

Permissions
[Open macOS Privacy & Security]
[Re-check permissions]

Behavior
[✓] Ask before controlling a new app
[✓] Ask before reading clipboard
[✓] Show visible indicator while active
```

---

## 20.13 Settings > Personalization

Docs say users can choose Friendly, Pragmatic, or None as the default personality, and add custom instructions. Editing custom instructions updates personal instructions in `AGENTS.md`. ([OpenAI 开发者][2])

Suggested UI:

```txt
Personalization

Default personality
( ) Friendly
(●) Pragmatic
( ) None

Custom instructions
┌──────────────────────────────────────────────┐
│ Prefer concise implementation plans.         │
│ Ask before changing public APIs.             │
│ Always run tests after code changes.         │
└──────────────────────────────────────────────┘

Stored in:
AGENTS.md

[Save]
```

---

## 20.14 Settings > Context-aware suggestions

Docs say context-aware suggestions surface follow-ups and tasks the user may want to resume when starting or returning to Codex. ([OpenAI 开发者][2])

Suggested UI:

```txt
Context-aware suggestions

[✓] Show suggested follow-ups
[✓] Suggest resumable threads
[✓] Suggest tasks from recent project activity
[ ] Suggest automations from repeated behavior

Suggestion sources
[✓] Recent threads
[✓] Git status
[✓] Terminal failures
[✓] Open PRs
```

---

# 21. Menus

For Electron, add a native app menu.

## 21.1 App menu

```txt
Codex
 ├── About Codex
 ├── Settings…              Cmd+,
 ├── Check for updates
 └── Quit
```

## 21.2 File

```txt
File
 ├── New Thread             Cmd+N
 ├── Open Project…
 ├── Add Project…
 └── Close Thread
```

## 21.3 View

```txt
View
 ├── Command Palette        Cmd+K
 ├── Toggle Sidebar
 ├── Toggle Terminal        Cmd+J
 ├── Toggle Review Panel
 └── Reload
```

## 21.4 Thread

```txt
Thread
 ├── Stop Codex
 ├── Archive Thread
 ├── Pin Thread
 ├── Open in Editor
 └── Export Summary
```

---

# 22. Important implementation objects

For Electron, model the app around these frontend entities:

```ts
type Project = {
  id: string
  name: string
  path: string
  git?: {
    repoRoot: string
    currentBranch: string
    status: "clean" | "dirty"
  }
  threads: ThreadSummary[]
}

type Thread = {
  id: string
  projectId: string
  title: string
  mode: "local" | "worktree" | "cloud"
  status:
    | "idle"
    | "running"
    | "needs_approval"
    | "needs_input"
    | "ready_for_review"
    | "failed"
    | "archived"
  messages: ThreadMessage[]
  worktree?: WorktreeInfo
  changedFiles: ChangedFile[]
  terminalSessions: TerminalSession[]
}

type Settings = {
  general: GeneralSettings
  profile: ProfileSettings
  shortcuts: ShortcutBinding[]
  notifications: NotificationSettings
  agent: AgentSettings
  appearance: AppearanceSettings
  git: GitSettings
  mcp: MCPSettings
  browser: BrowserSettings
  computerUse: ComputerUseSettings
  personalization: PersonalizationSettings
  suggestions: SuggestionSettings
}
```

---

# 23. UX details worth copying

The most important UX patterns to reproduce are:

```txt
1. Projects in sidebar, threads under projects.
2. Threads have visible state: running, needs approval, ready for review.
3. New thread starts from a clear composer with Local / Worktree / Cloud mode.
4. Agent output is a timeline, not just chat.
5. Diff review is first-class, not hidden.
6. Terminal is scoped to each thread.
7. Worktree metadata is always visible.
8. Settings are deep but grouped cleanly.
9. Keyboard shortcuts and command palette are central.
10. Approvals are explicit and safety-oriented.
```

For your Electron clone, I would design it less like “ChatGPT with a file tree” and more like **Linear + terminal + GitHub PR review + chat timeline** in one desktop shell.

[1]: https://developers.openai.com/codex/app "App – Codex | OpenAI Developers"
[2]: https://developers.openai.com/codex/app/settings "Settings – Codex app | OpenAI Developers"
[3]: https://openai.com/index/work-with-codex-from-anywhere/?utm_source=chatgpt.com "Work with Codex from anywhere"
[4]: https://developers.openai.com/codex/app/features "Features – Codex app | OpenAI Developers"
[5]: https://openai.com/index/introducing-the-codex-app/ "Introducing the Codex app | OpenAI"
[6]: https://developers.openai.com/codex/app/computer-use?utm_source=chatgpt.com "Computer Use – Codex app"
