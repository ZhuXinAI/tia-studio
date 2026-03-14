import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../persistence/client'
import { migrateAppSchema } from '../persistence/migrate'
import { GroupThreadsRepository } from '../persistence/repos/group-threads-repo'
import { GroupWorkspacesRepository } from '../persistence/repos/group-workspaces-repo'
import { GroupEventBus } from '../groups/group-event-bus'
import { GroupRunStatusStore } from '../server/chat/group-run-status-store'
import { GroupThreadEventsStore } from '../server/chat/group-thread-events-store'
import { GroupRuntimeService } from './group-runtime'

describe('GroupRuntimeService', () => {
  let db: AppDatabase
  let groupThreadsRepo: GroupThreadsRepository
  let groupsRepo: GroupWorkspacesRepository
  let bus: GroupEventBus
  let statusStore: GroupRunStatusStore
  let threadEventsStore: GroupThreadEventsStore
  let runtime: GroupRuntimeService
  let threadId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    groupThreadsRepo = new GroupThreadsRepository(db)
    groupsRepo = new GroupWorkspacesRepository(db)
    bus = new GroupEventBus()
    statusStore = new GroupRunStatusStore()
    threadEventsStore = new GroupThreadEventsStore()

    const group = await groupsRepo.create({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })
    const thread = await groupThreadsRepo.create({
      workspaceId: group.id,
      resourceId: 'default-profile',
      title: 'Launch room'
    })
    threadId = thread.id

    runtime = new GroupRuntimeService({
      groupThreadsRepo,
      bus,
      statusStore,
      threadEventsStore
    })
  })

  afterEach(() => {
    db.close()
  })

  it('submits a watcher message, starts a run, and publishes a run request', async () => {
    const publishedRuns: unknown[] = []
    bus.subscribe('group.run.requested', (event) => {
      publishedRuns.push(event)
    })

    const result = await runtime.submitWatcherMessage({
      threadId,
      profileId: 'default-profile',
      content: 'Plan a launch rollout'
    })

    expect(result).toEqual({
      runId: expect.any(String),
      messageId: expect.any(String)
    })
    await expect(groupThreadsRepo.listMessages(threadId)).resolves.toEqual([
      expect.objectContaining({
        id: result.messageId,
        role: 'user',
        authorType: 'watcher',
        content: 'Plan a launch rollout'
      })
    ])
    expect(statusStore.getEvents(result.runId)).toEqual([
      expect.objectContaining({
        type: 'run-started',
        threadId
      })
    ])
    expect(publishedRuns).toEqual([
      {
        runId: result.runId,
        groupThreadId: threadId,
        profileId: 'default-profile',
        triggerMessageId: result.messageId
      }
    ])
  })

  it('lists persisted room history for a valid thread', async () => {
    await groupThreadsRepo.appendMessage({
      threadId,
      role: 'user',
      authorType: 'watcher',
      authorName: 'You',
      content: 'Compare launch options'
    })

    await expect(
      runtime.listGroupThreadMessages({
        threadId,
        profileId: 'default-profile'
      })
    ).resolves.toEqual([
      expect.objectContaining({
        threadId,
        content: 'Compare launch options'
      })
    ])
  })
})
