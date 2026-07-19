import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { PermissionRulesRepository } from './permission-rules-repo'

describe('PermissionRulesRepository', () => {
  let db: AppDatabase
  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
  })
  afterEach(() => db.close())

  it('persists, lists, touches, deduplicates, and revokes workspace rules', async () => {
    const repository = new PermissionRulesRepository(db)
    const input = {
      workspacePath: '/repo',
      proposals: [{ tool: 'bash' as const, argvPrefix: ['git', 'status'], display: 'git status' }],
      rationale: 'Approved from the thread'
    }
    const first = await repository.createWorkspaceAllows(input)
    const duplicate = await repository.createWorkspaceAllows(input)
    expect(duplicate[0]?.id).toBe(first[0]?.id)
    expect(await repository.list('/repo')).toHaveLength(1)

    await repository.touch([first[0]!.id])
    expect((await repository.list('/repo'))[0]?.lastUsedAt).toBeTruthy()
    expect(await repository.delete(first[0]!.id)).toBe(true)
    expect(await repository.list('/repo')).toEqual([])
  })
})
