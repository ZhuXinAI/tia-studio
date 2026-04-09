# Project Structure Guide

This document is the longer companion to the short project structure section in the README.

It focuses on the main source folders that matter when you are trying to understand how TIA Studio works or where to make a change.

## The mental model

TIA Studio is an Electron app with a fairly clean split:

- `src/main` runs the desktop backend and all long-lived runtime services.
- `src/renderer/src` contains the React application and feature UI.
- `src/preload` exposes a safe bridge between Electron and the renderer.
- `src/test` holds shared test setup.

If you remember only one thing, remember this:

> the renderer is the interface, the main process is the application runtime.

That split explains most of the repository.

## `src/main`

`src/main` is the operational heart of the app.

It owns the Electron lifecycle, the local HTTP API, database access, assistant runtime services, background scheduling, channel adapters, and app-level integrations.

### What starts here

The main entry point bootstraps the desktop app and wires together the main subsystems:

- Electron window creation,
- the local Hono server,
- database migrations,
- built-in provider and assistant seeding,
- Mastra-backed assistant and team runtimes,
- channel services and message routing,
- cron and heartbeat schedulers,
- update and tray integration.

So when you want to understand how the whole app comes alive, `src/main/index.ts` is the best first file to read.

### Main subfolders

#### `src/main/server`

This folder is the local backend API used by the renderer.

It includes:

- `create-app.ts` for composing the Hono application,
- `routes/` for feature-specific HTTP endpoints,
- `validators/` for request parsing and validation,
- `chat/` for chat-specific request/response helpers,
- `providers/` for model/provider-related server utilities.

In practice, most renderer features eventually talk to something in `server/routes`.

#### `src/main/persistence`

This is the database layer.

It includes:

- the database client,
- schema migration logic,
- repository classes in `repos/`,
- SQL-backed models for assistants, channels, threads, cron jobs, heartbeats, team state, MCP servers, and related records.

If you need to know where durable application state lives, start here.

#### `src/main/mastra`

This folder contains the Mastra-based runtime layer.

It is responsible for:

- creating the shared Mastra instance,
- registering assistants as runtime agents,
- resolving providers and models,
- attaching memory, workspace, MCP, and tools,
- running direct assistant chats,
- running team chats,
- handling assistant workspace setup,
- defining assistant-facing tools.

This folder is where “saved assistant configuration” becomes “live assistant behavior”.

#### `src/main/channels`

This folder handles transport integration with external messaging systems.

It includes:

- channel adapter implementations such as Lark and Telegram,
- the channel event bus,
- the channel service that starts and reloads active adapters,
- the channel message router that converts inbound messages into assistant runs,
- shared transport types and the abstract channel base.

If a feature touches channel bindings or external messaging, this is one of the first places to inspect.

#### `src/main/cron`

This folder owns scheduled assistant work.

It covers:

- cron expression parsing,
- cron job persistence and orchestration,
- scheduler lifecycle,
- work log writing for scheduled runs.

Even though cron is configured through app features, the actual execution happens here in the main process.

#### `src/main/heartbeat`

This folder owns proactive assistant behavior that runs on a timed cadence.

It includes:

- heartbeat scheduling,
- heartbeat service orchestration,
- recent conversation lookup,
- heartbeat-specific run context helpers.

Heartbeat is related to assistants and channels, but it is kept separate because its scheduling and prompting rules are different from normal chat.

#### `src/main/default-agent`

This folder seeds and protects built-in application defaults.

It makes sure the app has:

- built-in providers,
- the built-in default assistant,
- the metadata needed to distinguish built-in runtime records from user-managed ones.

This helps the product ship with a usable starting state while still allowing user-managed assistants and channel bindings to stay separate.

#### `src/main/runtimes`

This folder manages external or managed runtime processes that the app can depend on.

It is the place to look when the app needs to discover, store, or coordinate runtime processes outside the core Electron process.

#### `src/main/skills`

This folder manages assistant skills as application data and runtime configuration.

If a feature affects how assistants discover, store, or present skills inside TIA Studio, this folder is part of the path.

#### `src/main/config`

This folder holds main-process configuration helpers such as server config resolution.

It is small, but it matters because it influences how the app and local API are initialized.

#### `src/main/web-search`

This folder isolates web-search-specific behavior used by the assistant runtime.

Keeping this separate helps the rest of the assistant runtime stay focused on orchestration instead of provider-specific search details.

## `src/renderer/src`

`src/renderer/src` is the React application that users actually see.

It is organized around app shell concerns, features, reusable UI, and small support libraries.

### What starts here

This area bootstraps the renderer app, mounts the React tree, initializes i18n, and defines the route structure for chat, team views, channel bindings, and settings.

If `src/main` is the runtime engine, `src/renderer/src` is the control panel.

### Main subfolders

#### `src/renderer/src/app`

This folder holds app-level composition:

- router setup,
- shared app shell layout,
- route-level wiring.

If you want to know how a page is reached or where global layout lives, start here.

#### `src/renderer/src/features`

This is the main feature area.

Feature code is grouped by domain instead of by technical layer, which makes the repo easier to navigate from a product point of view.

Important feature folders include:

- `assistants` — assistant editing, assistant queries, heartbeat settings, skills-related UI hooks.
- `claws` — channel binding list/query logic, editor dialogs, channel selection, pairing flows, and the channel binding management page.
- `settings` — providers, cron jobs, MCP servers, runtimes, web search, and general settings pages.
- `team` — team pages, team chat state, workspace-related queries, and team-specific UI.
- `threads` — direct chat routes, thread lists, message querying, and chat-page behavior.

When you are implementing a user-facing feature, you will usually spend most of your renderer time somewhere under `features`.

#### `src/renderer/src/components`

This folder contains reusable UI components and shared UI wrappers.

It includes:

- generic app components,
- Assistant UI integrations,
- common Radix-based UI primitives,
- shared error and theme helpers.

Use this area when the code should serve multiple features instead of belonging to only one.

#### `src/renderer/src/lib`

This folder holds small renderer-side utilities and app infrastructure helpers.

Examples include:

- API client helpers,
- query client setup,
- desktop app information readers,
- configuration helpers,
- general utility functions.

It is the glue layer that keeps feature code from having to reimplement infrastructure details.

#### `src/renderer/src/i18n`

This folder owns internationalization:

- i18n config,
- initialization,
- locale JSON files,
- translation hooks.

If text changes need translation support, this folder is part of the work.

#### `src/renderer/src/assets`

This folder contains renderer-side styles, images, and provider-related visual assets.

It helps keep presentation resources near the UI instead of scattering them across feature folders.

## `src/preload`

`src/preload` is the Electron safety boundary between the main process and the renderer.

The preload script exposes controlled APIs into the browser context so the renderer can talk to the desktop environment without getting unrestricted Node.js access.

This folder is usually small, but it is important because it defines what the renderer is allowed to ask of Electron directly.

## `src/test`

`src/test` contains shared testing setup used across the codebase.

Think of it as the common test harness layer rather than a full feature area.

If tests need global setup, mocks, or environment preparation, this is where that logic belongs.

## How a feature usually crosses the stack

A good way to understand the repo is to follow the path a feature normally takes:

1. **Renderer feature UI** collects user input and renders state.
2. **Renderer query/helper layer** sends requests to the local API.
3. **Main-process route handler** validates input and orchestrates domain work.
4. **Repositories and services** persist data and trigger runtime behavior.
5. **Mastra, channel, cron, or heartbeat runtime layers** perform the long-lived or execution-heavy work.

That pattern shows up again and again:

- a channel binding edit starts in the renderer and ends in channel reload + assistant runtime state,
- a provider change starts in settings and ends in model resolution,
- a new team thread starts in the UI and ends in team runtime execution.

Once you learn that flow, the project becomes much easier to navigate.

## Where to start when you are new

If you are exploring the codebase for the first time, this is a good reading order:

1. `src/main/index.ts`
2. `src/main/server/create-app.ts`
3. `src/renderer/src/app/router.tsx`
4. the specific feature folder you care about under `src/renderer/src/features`
5. the matching route and repository in `src/main/server` and `src/main/persistence`
6. the runtime folder involved, such as `src/main/mastra` or `src/main/channels`

That path lets you move from the product surface to the underlying runtime without getting lost in details too early.
