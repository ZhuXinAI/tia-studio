import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateAppSchema } from '../migrate'
import { AgentSessionsRepository } from './agent-sessions-repo'

let directory: string | null = null
afterEach(async () => {
  if (directory) {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
  directory = null
})

describe('AgentSessionsRepository', () => {
  it('persists access, pinning, messages, events, and clears interactions', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-agent-repo-'))
    const db = await migrateAppSchema(join(directory, 'app.db'))
    await db.execute(
      "INSERT INTO app_providers (id, name, type, api_key, selected_model) VALUES ('p', 'P', 'openai', 'k', 'gpt-4o')"
    )
    await db.execute(
      "INSERT INTO app_workspaces (id, name, root_path) VALUES ('w', 'Workspace', '/tmp/workspace')"
    )
    await db.execute(
      "INSERT INTO app_automations (id, name, prompt, rrule, workspace_id, provider_id, model_id) VALUES ('schedule', 'Schedule', 'Run', 'FREQ=DAILY', 'w', 'p', 'gpt-4o')"
    )
    const repo = new AgentSessionsRepository(db)
    const session = await repo.create({
      automationId: 'schedule',
      workspaceId: null,
      workspacePath: directory,
      providerId: 'p',
      provider: 'openai',
      modelId: 'gpt-4o',
      accessMode: 'standard'
    })
    expect(session.automationId).toBe('schedule')
    const pending = await repo.update(session.id, {
      accessMode: 'full',
      pinned: true,
      pendingInteraction: { id: 'i', method: 'confirm', title: 'Allow?', message: 'Risky' }
    })
    expect(pending).toMatchObject({ accessMode: 'full', pinned: true })
    expect(pending?.pendingInteraction?.id).toBe('i')
    const cleared = await repo.update(session.id, { pendingInteraction: null })
    expect(cleared?.pendingInteraction).toBeUndefined()
    await db.close()
  })
})
