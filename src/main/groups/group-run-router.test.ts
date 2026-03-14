import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../persistence/client'
import { migrateAppSchema } from '../persistence/migrate'
import { AssistantsRepository } from '../persistence/repos/assistants-repo'
import { GroupThreadsRepository } from '../persistence/repos/group-threads-repo'
import { GroupWorkspacesRepository } from '../persistence/repos/group-workspaces-repo'
import { ProvidersRepository } from '../persistence/repos/providers-repo'
import { ThreadsRepository } from '../persistence/repos/threads-repo'
import { GroupEventBus } from './group-event-bus'
import { GroupRunRouter } from './group-run-router'
import { GroupRunStatusStore } from '../server/chat/group-run-status-store'
import { GroupThreadEventsStore } from '../server/chat/group-thread-events-store'

async function expectEventually(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  throw lastError
}

describe('GroupRunRouter', () => {
  let db: AppDatabase
  let bus: GroupEventBus
  let assistantsRepo: AssistantsRepository
  let groupThreadsRepo: GroupThreadsRepository
  let groupWorkspacesRepo: GroupWorkspacesRepository
  let threadsRepo: ThreadsRepository
  let statusStore: GroupRunStatusStore
  let threadEventsStore: GroupThreadEventsStore

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    bus = new GroupEventBus()
    assistantsRepo = new AssistantsRepository(db)
    groupThreadsRepo = new GroupThreadsRepository(db)
    groupWorkspacesRepo = new GroupWorkspacesRepository(db)
    threadsRepo = new ThreadsRepository(db)
    statusStore = new GroupRunStatusStore()
    threadEventsStore = new GroupThreadEventsStore()

    const providersRepo = new ProvidersRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })

    await assistantsRepo.create({
      name: 'Planner',
      providerId: provider.id,
      enabled: true
    })
    await assistantsRepo.create({
      name: 'Researcher',
      providerId: provider.id,
      enabled: true
    })
  })

  it('serializes runs per group thread', async () => {
    const group = await groupWorkspacesRepo.create({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })
    await groupWorkspacesRepo.update(group.id, {
      maxAutoTurns: 1
    })
    const assistants = await assistantsRepo.list()
    await groupWorkspacesRepo.replaceMembers(
      group.id,
      assistants.map((assistant) => assistant.id)
    )
    const thread = await groupThreadsRepo.create({
      workspaceId: group.id,
      resourceId: 'default-profile',
      title: 'Launch room'
    })

    const firstMessage = await groupThreadsRepo.appendMessage({
      threadId: thread.id,
      role: 'user',
      authorType: 'watcher',
      authorName: 'You',
      content: 'First request'
    })
    const secondMessage = await groupThreadsRepo.appendMessage({
      threadId: thread.id,
      role: 'user',
      authorType: 'watcher',
      authorName: 'You',
      content: 'Second request'
    })

    let releaseFirstRun: (() => void) | undefined
    const firstRunGate = new Promise<void>((resolve) => {
      releaseFirstRun = resolve
    })
    const startedRuns: string[] = []
    const assistantRuntime = {
      runGroupTurn: vi.fn(async (params) => {
        startedRuns.push(params.groupContext.runId)
        if (params.groupContext.runId === 'run-1') {
          await firstRunGate
        }

        await bus.publish('group.message.requested', {
          eventId: `evt:${params.groupContext.runId}`,
          runId: params.groupContext.runId,
          groupThreadId: params.groupContext.groupThreadId,
          assistantId: params.assistantId,
          content: `reply:${params.groupContext.runId}`,
          mentions: []
        })

        return {
          outputText: `reply:${params.groupContext.runId}`
        }
      })
    }

    const router = new GroupRunRouter({
      bus,
      assistantsRepo,
      groupThreadsRepo,
      groupWorkspacesRepo,
      threadsRepo,
      assistantRuntime,
      statusStore,
      threadEventsStore
    })

    await router.start()

    statusStore.startRun({ runId: 'run-1', threadId: thread.id })
    statusStore.startRun({ runId: 'run-2', threadId: thread.id })

    await bus.publish('group.run.requested', {
      runId: 'run-1',
      groupThreadId: thread.id,
      profileId: 'default-profile',
      triggerMessageId: firstMessage.id
    })
    await bus.publish('group.run.requested', {
      runId: 'run-2',
      groupThreadId: thread.id,
      profileId: 'default-profile',
      triggerMessageId: secondMessage.id
    })

    await expectEventually(() => {
      expect(startedRuns).toEqual(['run-1'])
    })

    if (releaseFirstRun) {
      releaseFirstRun()
    }

    await expectEventually(() => {
      expect(startedRuns).toEqual(['run-1', 'run-2'])
    })
  })

  it('allows group members to run even when their assistant enabled flag is false', async () => {
    const group = await groupWorkspacesRepo.create({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })
    await groupWorkspacesRepo.update(group.id, {
      maxAutoTurns: 1
    })

    const assistants = await assistantsRepo.list()
    const disabledAssistant = assistants[0]
    expect(disabledAssistant).toBeTruthy()

    await assistantsRepo.update(disabledAssistant!.id, {
      enabled: false
    })

    await groupWorkspacesRepo.replaceMembers(group.id, [disabledAssistant!.id])

    const thread = await groupThreadsRepo.create({
      workspaceId: group.id,
      resourceId: 'default-profile',
      title: 'Launch room'
    })

    const triggerMessage = await groupThreadsRepo.appendMessage({
      threadId: thread.id,
      role: 'user',
      authorType: 'watcher',
      authorName: 'You',
      content: 'First request'
    })

    const assistantRuntime = {
      runGroupTurn: vi.fn(async (params) => {
        await bus.publish('group.message.requested', {
          eventId: `evt:${params.groupContext.runId}`,
          runId: params.groupContext.runId,
          groupThreadId: params.groupContext.groupThreadId,
          assistantId: params.assistantId,
          content: 'reply from disabled assistant',
          mentions: []
        })

        return {
          outputText: 'reply from disabled assistant'
        }
      })
    }

    const router = new GroupRunRouter({
      bus,
      assistantsRepo,
      groupThreadsRepo,
      groupWorkspacesRepo,
      threadsRepo,
      assistantRuntime,
      statusStore,
      threadEventsStore
    })

    await router.start()

    statusStore.startRun({ runId: 'run-disabled', threadId: thread.id })

    await bus.publish('group.run.requested', {
      runId: 'run-disabled',
      groupThreadId: thread.id,
      profileId: 'default-profile',
      triggerMessageId: triggerMessage.id
    })

    await expectEventually(() => {
      expect(assistantRuntime.runGroupTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          assistantId: disabledAssistant!.id
        })
      )
    })

    await expectEventually(() => {
      expect(statusStore.getEvents('run-disabled')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'message-posted' }),
          expect.objectContaining({ type: 'run-finished' })
        ])
      )
    })

    await router.stop()
  })
})
