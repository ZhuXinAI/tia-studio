import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { GroupWorkspacesRepository } from './group-workspaces-repo'

describe('GroupWorkspacesRepository', () => {
  let db: AppDatabase
  let repo: GroupWorkspacesRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new GroupWorkspacesRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('stores group workspace config and ordered members', async () => {
    const workspace = await repo.create({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })

    await repo.update(workspace.id, {
      groupDescription: 'Brainstorm a launch plan',
      maxAutoTurns: 6
    })
    await repo.replaceMembers(workspace.id, ['assistant-1', 'assistant-2'])

    await expect(repo.getById(workspace.id)).resolves.toMatchObject({
      name: 'Launch Group',
      groupDescription: 'Brainstorm a launch plan',
      maxAutoTurns: 6
    })
    await expect(repo.listMembers(workspace.id)).resolves.toEqual([
      expect.objectContaining({ assistantId: 'assistant-1', sortOrder: 0 }),
      expect.objectContaining({ assistantId: 'assistant-2', sortOrder: 1 })
    ])
  })
})
