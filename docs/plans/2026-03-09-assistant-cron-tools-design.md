# Assistant Cron Tools Design

## Goal

Give each assistant first-class tools to create, list, and remove its own cron jobs while preserving the current background-run behavior: cron executions must not persist assistant thread memory and must continue writing work logs instead.

## Current State

- Cron jobs already exist as persisted records in `app_cron_jobs`.
- The HTTP cron route creates a hidden thread for each cron job and reloads the in-process scheduler.
- `AssistantRuntimeService.runCronJob(...)` already runs cron prompts without a Mastra `memory` payload and marks the run with heartbeat request context so `HEARTBEAT.md` is loaded.
- There are currently no assistant-facing cron management tools, so assistants cannot create or manage their own schedules.

## Requirements

1. An assistant can create, list, and remove only its own cron jobs.
2. Tool-created cron jobs must use the same hidden-thread and scheduler-reload behavior as UI/API-created jobs.
3. Cron executions must keep the current isolation contract:
   - no assistant thread memory persistence for the scheduled run
   - work-log creation remains the durable output path
4. Existing HTTP routes must keep working and should share logic with the new tools instead of duplicating it.

## Approaches Considered

### Option A: Add cron tools directly in `AssistantRuntimeService`

Implement tool logic inline inside the runtime, calling repositories directly.

- Pros: small diff
- Cons: duplicates route logic, spreads cron lifecycle rules across multiple places

### Option B: Shared cron job management service

Extract cron creation/list/delete/update lifecycle into a reusable service under `src/main/cron`, then use it from both the route layer and Mastra tools.

- Pros: single source of truth for hidden-thread lifecycle, validation, and scheduler reloads
- Pros: easiest to keep UI/API and assistant tool behavior aligned
- Cons: modest refactor of route wiring

### Option C: Have tools call the HTTP route layer

Reuse the route behavior indirectly through internal HTTP calls or handler wrappers.

- Pros: avoids new domain service
- Cons: poor layering, awkward typing, and harder tests

## Chosen Design

Use **Option B**: introduce a shared cron job management service and expose assistant-local Mastra tools on top of it.

## Architecture

### Shared Service

Add a service in `src/main/cron` that owns cron-job lifecycle rules:

- validate that the target assistant exists and has a workspace root
- create a cron job plus its hidden cron thread
- update a cron job, including hidden-thread rotation when the assistant changes
- delete a cron job and its hidden thread
- reload the scheduler after mutations
- re-read the stored cron job after reload so returned data reflects the latest `nextRunAt`

This service becomes the single place that knows how persisted cron jobs map to threads and scheduler state.

### Assistant Tools

Add `src/main/mastra/tools/cron-tools.ts` exposing:

- `createCronJob`
- `listCronJobs`
- `removeCronJob`

These tools receive the current assistant ID when they are created, so they never accept an arbitrary assistant ID from the model. That prevents cross-assistant cron management by construction.

### Runtime Wiring

Inject the shared cron job service into `AssistantRuntimeService`. When an assistant has a workspace root, register the cron tools alongside the existing browser, SOUL, work-log, and channel tools.

### Route Wiring

Refactor `registerCronJobsRoute(...)` to use the shared cron job service for create/update/delete behavior while keeping the existing request/response validation at the route boundary.

## Data Flow

### Create Cron Job From Assistant Tool

1. Assistant calls `createCronJob`.
2. Tool invokes the shared cron job service with the current assistant ID.
3. Service validates workspace eligibility.
4. Service creates the cron job record.
5. Service creates the hidden cron thread and stores `threadId` on the cron job.
6. Service reloads the scheduler.
7. Service re-reads the job and returns it to the tool.

### Execute Cron Job

1. Scheduler loads enabled jobs and schedules timers.
2. When triggered, scheduler calls `assistantRuntime.runCronJob(...)`.
3. `runCronJob(...)` sets heartbeat request context and does **not** send a `memory` payload.
4. Input processing loads `HEARTBEAT.md` in addition to the normal workspace context.
5. Scheduler collects final text output and writes a work log.

## Error Handling

- Invalid cron expressions remain rejected at the route or tool boundary before persistence.
- Missing assistant, missing workspace root, missing cron job, or assistant/job ownership mismatches surface as structured service errors.
- Tool deletion should return a helpful failure when the requested cron job does not belong to the current assistant.

## Testing Strategy

1. Add tool unit tests for assistant-local create/list/remove behavior.
2. Extend runtime registration tests to assert the cron tools are present for assistants with workspaces.
3. Add service tests for hidden-thread creation/deletion and ownership rules.
4. Keep the existing route tests and adapt them to verify the route still uses the same lifecycle behavior.

## Non-Goals

- No new heartbeat tool is added in this slice.
- No cross-assistant cron management is added.
- No change to cron execution persistence semantics beyond preserving the current no-memory/work-log behavior.
