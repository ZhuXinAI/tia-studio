import { afterEach, describe, expect, it } from 'vitest'
import { migrateAppSchema } from '../migrate'
import { MemoriesRepository } from './memories-repo'

describe('memories repository', () => {
  let db: Awaited<ReturnType<typeof migrateAppSchema>> | undefined

  afterEach(async () => {
    await db?.close()
    db = undefined
  })

  it('stores global and workspace memories with explicit enabled state', async () => {
    db = await migrateAppSchema(':memory:')
    await db.execute(
      "INSERT INTO app_workspaces (id, name, root_path) VALUES ('workspace-1', 'Project', '/tmp/project')"
    )
    const repository = new MemoriesRepository(db)
    const global = await repository.create({
      workspaceId: null,
      title: 'Global preference',
      content: 'Keep answers concise.',
      enabled: true
    })
    const scoped = await repository.create({
      workspaceId: 'workspace-1',
      title: 'Project context',
      content: 'Use the project terminology.',
      enabled: false
    })

    expect(await repository.list('workspace-1')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: global.id, workspaceId: null, enabled: true }),
        expect.objectContaining({ id: scoped.id, workspaceId: 'workspace-1', enabled: false })
      ])
    )
    expect(await repository.update(scoped.id, { ...scoped, enabled: true })).toEqual(
      expect.objectContaining({ id: scoped.id, enabled: true })
    )
    expect(await repository.delete(global.id)).toBe(true)
    expect(await repository.getById(global.id)).toBeNull()
  })
})
