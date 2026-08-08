import { afterEach, describe, expect, it } from 'vitest'
import { migrateAppSchema } from '../migrate'
import { AgentArtifactsRepository } from './artifacts-repo'

describe('agent artifacts repository', () => {
  let db: Awaited<ReturnType<typeof migrateAppSchema>> | undefined

  afterEach(async () => {
    await db?.close()
    db = undefined
  })

  it('persists artifacts and lists them newest first for a session', async () => {
    db = await migrateAppSchema(':memory:')
    await db.execute(
      "INSERT INTO app_providers (id, name, type, api_key, selected_model) VALUES ('p', 'P', 'openai', 'secret', 'gpt-4o')"
    )
    await db.execute(
      "INSERT INTO app_agent_sessions (id, workspace_path, title, provider_id, provider, model_id) VALUES ('s', '/tmp/workspace', 'Thread', 'p', 'openai', 'gpt-4o')"
    )
    const repository = new AgentArtifactsRepository(db)
    await repository.create({
      id: 'artifact-1',
      sessionId: 's',
      name: 'summary.md',
      kind: 'text',
      relativePath: 'summary.md',
      previewText: 'hello',
      sourceToolName: 'createOrUpdateDeliverable',
      createdAt: '2026-08-08T00:00:00.000Z'
    })

    expect(await repository.listBySession('s')).toEqual([
      expect.objectContaining({
        id: 'artifact-1',
        relativePath: 'summary.md',
        previewText: 'hello'
      })
    ])
  })

  it('creates or updates an explicit deliverable without crossing sessions', async () => {
    db = await migrateAppSchema(':memory:')
    await db.execute(
      "INSERT INTO app_providers (id, name, type, api_key, selected_model) VALUES ('p', 'P', 'openai', 'secret', 'gpt-4o')"
    )
    await db.execute(
      "INSERT INTO app_agent_sessions (id, workspace_path, title, provider_id, provider, model_id) VALUES ('s', '/tmp/workspace', 'Thread', 'p', 'openai', 'gpt-4o')"
    )
    await db.execute(
      "INSERT INTO app_agent_sessions (id, workspace_path, title, provider_id, provider, model_id) VALUES ('other', '/tmp/other', 'Other', 'p', 'openai', 'gpt-4o')"
    )

    const repository = new AgentArtifactsRepository(db)
    await repository.createOrUpdate({
      id: 'deliverable-1',
      sessionId: 's',
      name: 'summary.md',
      kind: 'text',
      previewText: 'draft',
      sourceToolName: 'createOrUpdateDeliverable'
    })
    const updated = await repository.createOrUpdate({
      id: 'deliverable-1',
      sessionId: 's',
      name: 'summary.md',
      kind: 'text',
      previewText: 'final',
      sourceToolName: 'createOrUpdateDeliverable'
    })

    expect(updated.previewText).toBe('final')
    expect(await repository.listBySession('s')).toEqual([
      expect.objectContaining({ id: 'deliverable-1', previewText: 'final' })
    ])
    await expect(
      repository.createOrUpdate({
        id: 'deliverable-1',
        sessionId: 'other',
        name: 'stolen.md',
        kind: 'text',
        previewText: 'no'
      })
    ).rejects.toThrow('cannot be reused across sessions')
  })

  it('does not surface legacy tool output as a deliverable', async () => {
    db = await migrateAppSchema(':memory:')
    await db.execute(
      "INSERT INTO app_providers (id, name, type, api_key, selected_model) VALUES ('p', 'P', 'openai', 'secret', 'gpt-4o')"
    )
    await db.execute(
      "INSERT INTO app_agent_sessions (id, workspace_path, title, provider_id, provider, model_id) VALUES ('s', '/tmp/workspace', 'Thread', 'p', 'openai', 'gpt-4o')"
    )
    const repository = new AgentArtifactsRepository(db)
    await repository.create({
      id: 'legacy-tool-output',
      sessionId: 's',
      name: 'bash output',
      kind: 'tool-output',
      sourceToolName: 'bash',
      previewText: '{"ok":true}'
    })

    expect(await repository.listBySession('s')).toEqual([])
  })
})
