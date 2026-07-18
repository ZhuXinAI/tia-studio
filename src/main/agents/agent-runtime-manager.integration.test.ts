import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateAppSchema } from '../persistence/migrate'
import { AgentSessionsRepository } from '../persistence/repos/agent-sessions-repo'
import { ProvidersRepository } from '../persistence/repos/providers-repo'
import { AgentRuntimeManager } from './agent-runtime-manager'
import { removeTestDirectory } from '../../test/remove-test-directory'

let directory: string | null = null
afterEach(async () => {
  if (directory) {
    await removeTestDirectory(directory)
  }
  directory = null
})

describe('AgentRuntimeManager with embedded Pi SDK', () => {
  it('rolls back a session row when startup fails', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-failed-pi-'))
    const db = await migrateAppSchema(join(directory, 'app.db'))
    const sessions = new AgentSessionsRepository(db)
    const providers = new ProvidersRepository(db)
    const provider = await providers.create({
      name: 'Disabled',
      type: 'openai',
      apiKey: 'unused',
      selectedModel: 'gpt-4o',
      enabled: false
    })
    const manager = new AgentRuntimeManager({
      sessionsRepo: sessions,
      providersRepo: providers,
      agentDataRoot: join(directory, 'agent'),
      sessionDataRoot: join(directory, 'sessions'),
      credentialRoot: directory,
      globalSkillsRoot: join(directory, 'skills')
    })

    await expect(
      manager.createSession({
        workspaceId: null,
        workspacePath: join(directory, 'workspace'),
        providerId: provider.id,
        provider: 'openai',
        modelId: 'gpt-4o'
      })
    ).rejects.toThrow('selected provider is unavailable')
    expect(await sessions.list()).toEqual([])
    await db.close()
  })

  it('creates an in-process SDK session, captures its identity, and shuts it down', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tia-real-pi-'))
    const db = await migrateAppSchema(join(directory, 'app.db'))
    const providers = new ProvidersRepository(db)
    const provider = await providers.create({
      name: 'Probe',
      type: 'openai',
      apiKey: 'not-used-for-state',
      selectedModel: 'gpt-4o',
      enabled: true
    })
    const manager = new AgentRuntimeManager({
      sessionsRepo: new AgentSessionsRepository(db),
      providersRepo: providers,
      agentDataRoot: join(directory, 'agent'),
      sessionDataRoot: join(directory, 'sessions'),
      credentialRoot: directory,
      globalSkillsRoot: join(directory, 'skills')
    })
    const created = await manager.createSession({
      workspaceId: null,
      workspacePath: join(directory, 'workspace'),
      providerId: provider.id,
      provider: provider.type,
      modelId: provider.selectedModel
    })
    expect(created.upstreamSessionId).toMatch(/[0-9a-f-]{20,}/)
    expect(created.upstreamSessionFile).toContain(join(directory, 'sessions'))
    expect(created.status).toBe('idle')
    await manager.shutdown()
    expect((await manager.getSession(created.id)).status).toBe('stopped')
    await db.close()
  }, 15_000)
})
