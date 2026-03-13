import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { GroupThreadsRepository } from './group-threads-repo'
import { GroupWorkspacesRepository } from './group-workspaces-repo'

describe('GroupThreadsRepository', () => {
  let db: AppDatabase
  let repo: GroupThreadsRepository
  let groupWorkspacesRepo: GroupWorkspacesRepository
  let workspaceId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new GroupThreadsRepository(db)
    groupWorkspacesRepo = new GroupWorkspacesRepository(db)
    const workspace = await groupWorkspacesRepo.create({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })
    workspaceId = workspace.id
  })

  afterEach(() => {
    db.close()
  })

  it('stores room messages and assistant thread bindings per group thread', async () => {
    const thread = await repo.create({
      workspaceId,
      resourceId: 'default-profile',
      title: ''
    })

    const watcherMessage = await repo.appendMessage({
      threadId: thread.id,
      role: 'user',
      authorType: 'watcher',
      authorName: 'You',
      content: 'Compare launch options',
      mentions: ['assistant-2']
    })

    await repo.upsertAssistantThreadBinding({
      groupThreadId: thread.id,
      assistantId: 'assistant-1',
      assistantThreadId: 'assistant-thread-1'
    })

    await expect(repo.listMessages(thread.id)).resolves.toMatchObject([
      {
        id: watcherMessage.id,
        role: 'user',
        authorType: 'watcher',
        content: 'Compare launch options',
        mentions: ['assistant-2']
      }
    ])
    await expect(repo.listAssistantThreadBindings(thread.id)).resolves.toEqual([
      expect.objectContaining({
        assistantId: 'assistant-1',
        assistantThreadId: 'assistant-thread-1'
      })
    ])
  })
})
