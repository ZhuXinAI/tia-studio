import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { GroupThreadsRepository } from '../../persistence/repos/group-threads-repo'
import { GroupWorkspacesRepository } from '../../persistence/repos/group-workspaces-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { GroupEventBus } from '../../groups/group-event-bus'
import { GroupRunRouter } from '../../groups/group-run-router'
import { GroupRuntimeService } from '../../mastra/group-runtime'
import { GroupRunStatusStore } from '../chat/group-run-status-store'
import { GroupThreadEventsStore } from '../chat/group-thread-events-store'
import { registerGroupChatRoute } from './group-chat-route'

async function expectEventually(
  assertion: () => void | Promise<void>,
  timeoutMs = 1000
): Promise<void> {
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  throw lastError
}

describe('group chat route', () => {
  let db: AppDatabase
  let app: Hono
  let groupThreadsRepo: GroupThreadsRepository
  let groupsRepo: GroupWorkspacesRepository
  let threadsRepo: ThreadsRepository
  let groupRunStatusStore: GroupRunStatusStore
  let groupThreadEventsStore: GroupThreadEventsStore
  let bus: GroupEventBus
  let threadId: string
  let router: GroupRunRouter

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    groupsRepo = new GroupWorkspacesRepository(db)
    groupThreadsRepo = new GroupThreadsRepository(db)
    threadsRepo = new ThreadsRepository(db)
    groupRunStatusStore = new GroupRunStatusStore()
    groupThreadEventsStore = new GroupThreadEventsStore()
    bus = new GroupEventBus()

    const providersRepo = new ProvidersRepository(db)
    const assistantsRepo = new AssistantsRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const planner = await assistantsRepo.create({
      name: 'Planner',
      providerId: provider.id,
      enabled: true
    })
    const researcher = await assistantsRepo.create({
      name: 'Researcher',
      providerId: provider.id,
      enabled: true
    })

    const group = await groupsRepo.create({
      name: 'Launch Group',
      rootPath: ''
    })
    await groupsRepo.update(group.id, {
      maxAutoTurns: 1
    })
    await groupsRepo.replaceMembers(group.id, [planner.id, researcher.id])

    const thread = await groupThreadsRepo.create({
      workspaceId: group.id,
      resourceId: 'default-profile',
      title: ''
    })
    threadId = thread.id

    router = new GroupRunRouter({
      bus,
      assistantsRepo,
      groupThreadsRepo,
      groupWorkspacesRepo: groupsRepo,
      threadsRepo,
      assistantRuntime: {
        runGroupTurn: vi.fn(async (params) => {
          await bus.publish('group.message.requested', {
            eventId: `evt:${params.groupContext.runId}`,
            runId: params.groupContext.runId,
            groupThreadId: params.groupContext.groupThreadId,
            assistantId: params.assistantId,
            content: 'Planner reply',
            mentions: []
          })

          return {
            outputText: 'Planner reply'
          }
        })
      },
      statusStore: groupRunStatusStore,
      threadEventsStore: groupThreadEventsStore
    })
    await router.start()

    const groupRuntime = new GroupRuntimeService({
      groupThreadsRepo,
      bus,
      statusStore: groupRunStatusStore,
      threadEventsStore: groupThreadEventsStore
    })

    app = new Hono()
    registerGroupChatRoute(app, {
      groupRuntime,
      groupRunStatusStore,
      groupThreadEventsStore
    })
  })

  afterEach(async () => {
    await router.stop()
    db.close()
  })

  it('submits a watcher message, queues a run, and exposes status/history routes', async () => {
    const response = await app.request(`http://localhost/group-chat/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'default-profile',
        content: 'Plan a launch rollout'
      })
    })

    expect(response.status).toBe(202)
    expect(response.headers.get('x-group-run-id')).toBeTruthy()

    const payload = await response.json()
    expect(payload).toEqual({
      runId: expect.any(String),
      messageId: expect.any(String)
    })

    await expectEventually(async () => {
      const messages = await groupThreadsRepo.listMessages(threadId)
      expect(messages).toHaveLength(2)
    })

    const historyResponse = await app.request(
      `http://localhost/group-chat/${threadId}/history?profileId=default-profile`
    )

    expect(historyResponse.status).toBe(200)
    await expect(historyResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: payload.messageId,
        threadId,
        authorType: 'watcher',
        content: 'Plan a launch rollout'
      }),
      expect.objectContaining({
        threadId,
        authorType: 'assistant',
        content: 'Planner reply'
      })
    ])

    const statusResponse = await app.request(
      `http://localhost/group-chat/${threadId}/runs/${payload.runId}/status`
    )

    expect(statusResponse.status).toBe(200)
    const statusText = await statusResponse.text()
    expect(statusText).toContain('"type":"run-started"')
    expect(statusText).toContain('"type":"speaker-selected"')
    expect(statusText).toContain('"type":"message-posted"')
    expect(statusText).toContain('"type":"run-finished"')
  })

  it('streams buffered thread events for the requested profile', async () => {
    const submitResponse = await app.request(`http://localhost/group-chat/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'default-profile',
        content: 'Plan a launch rollout'
      })
    })

    expect(submitResponse.status).toBe(202)

    await expectEventually(async () => {
      const messages = await groupThreadsRepo.listMessages(threadId)
      expect(messages).toHaveLength(2)
    })

    const eventsResponse = await app.request(
      `http://localhost/group-chat/${threadId}/events?profileId=default-profile`
    )

    expect(eventsResponse.status).toBe(200)
    expect(eventsResponse.headers.get('Content-Type')).toContain('text/event-stream')

    const reader = eventsResponse.body?.getReader()
    expect(reader).toBeTruthy()

    let text = ''
    while (!text.includes('"type":"group-thread-message-created"')) {
      const nextChunk = await reader!.read()
      if (nextChunk.done) {
        break
      }

      text += new TextDecoder().decode(nextChunk.value)
    }

    await reader!.cancel()

    expect(text).toContain('"type":"group-thread-message-created"')
    expect(text).toContain(`"threadId":"${threadId}"`)
  })

  it('returns 404 for missing group threads', async () => {
    const historyResponse = await app.request(
      'http://localhost/group-chat/missing-thread/history?profileId=default-profile'
    )
    expect(historyResponse.status).toBe(404)

    const submitResponse = await app.request('http://localhost/group-chat/missing-thread/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'default-profile',
        content: 'Hello'
      })
    })
    expect(submitResponse.status).toBe(404)
  })
})
