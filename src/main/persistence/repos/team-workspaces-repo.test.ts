import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { TeamThreadsRepository } from './team-threads-repo'
import { TeamWorkspacesRepository } from './team-workspaces-repo'

describe('TeamWorkspacesRepository', () => {
  let db: AppDatabase
  let repo: TeamWorkspacesRepository
  let teamThreadsRepo: TeamThreadsRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new TeamWorkspacesRepository(db)
    teamThreadsRepo = new TeamThreadsRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('creates and lists team workspaces', async () => {
    await repo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })

    const workspaces = await repo.list()

    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]).toMatchObject({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })
  })

  it('updates an existing team workspace', async () => {
    const workspace = await repo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })

    const updated = await repo.update(workspace.id, {
      name: 'Release Workspace',
      rootPath: '/Users/demo/release'
    })

    expect(updated).toMatchObject({
      id: workspace.id,
      name: 'Release Workspace',
      rootPath: '/Users/demo/release'
    })
  })

  it('deletes team workspaces and cascades to team threads and members', async () => {
    const workspace = await repo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })
    const thread = await teamThreadsRepo.create({
      workspaceId: workspace.id,
      resourceId: 'default-profile',
      title: 'Release team'
    })

    await teamThreadsRepo.replaceMembers(thread.id, ['assistant-2', 'assistant-1'])

    const deleted = await repo.delete(workspace.id)

    expect(deleted).toBe(true)
    await expect(teamThreadsRepo.getById(thread.id)).resolves.toBeNull()
    await expect(teamThreadsRepo.listMembers(thread.id)).resolves.toEqual([])
    await expect(repo.list()).resolves.toEqual([])
  })
})
