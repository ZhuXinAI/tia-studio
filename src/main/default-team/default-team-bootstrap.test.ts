import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../persistence/client'
import { migrateAppSchema } from '../persistence/migrate'
import { ProvidersRepository } from '../persistence/repos/providers-repo'
import { TeamWorkspacesRepository } from '../persistence/repos/team-workspaces-repo'
import {
  DEFAULT_TEAM_NAME,
  ensureBuiltInDefaultTeamWorkspace,
  resolveDefaultTeamWorkspacePath
} from './default-team-bootstrap'

describe('default team bootstrap', () => {
  let db: AppDatabase
  let providersRepo: ProvidersRepository
  let teamWorkspacesRepo: TeamWorkspacesRepository
  let userDataPath: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    providersRepo = new ProvidersRepository(db)
    teamWorkspacesRepo = new TeamWorkspacesRepository(db)
    userDataPath = await mkdtemp(path.join(os.tmpdir(), 'tia-default-team-'))
  })

  afterEach(() => {
    db.close()
    void rm(userDataPath, { recursive: true, force: true }).catch(() => undefined)
  })

  it('creates and marks the built-in default team workspace', async () => {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })

    await ensureBuiltInDefaultTeamWorkspace({
      teamWorkspacesRepo,
      providersRepo,
      userDataPath
    })

    const workspaces = await teamWorkspacesRepo.list()
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]).toMatchObject({
      name: DEFAULT_TEAM_NAME,
      rootPath: resolveDefaultTeamWorkspacePath(userDataPath),
      supervisorProviderId: provider.id,
      supervisorModel: 'gpt-5'
    })
    await expect(teamWorkspacesRepo.isBuiltInDefaultWorkspace(workspaces[0].id)).resolves.toBe(true)
  })
})
