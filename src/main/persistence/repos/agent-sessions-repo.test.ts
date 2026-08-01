import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateAppSchema } from '../migrate'
import { AgentSessionsRepository } from './agent-sessions-repo'
import { removeTestDirectory } from '../../../test/remove-test-directory'

let directory: string | null = null
afterEach(async () => {
  if (directory) {
    await removeTestDirectory(directory)
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

    await repo.appendMessage({
      id: 'assistant-error',
      sessionId: session.id,
      role: 'assistant',
      parts: [],
      status: 'error',
      error: 'HTTP 400: invalid thinking parameter',
      createdAt: '2026-08-01T00:00:00.000Z',
      completedAt: '2026-08-01T00:00:01.000Z'
    })
    await expect(repo.listMessages(session.id)).resolves.toEqual([
      expect.objectContaining({
        id: 'assistant-error',
        status: 'error',
        error: 'HTTP 400: invalid thinking parameter'
      })
    ])

    await db.close()
  })
})
