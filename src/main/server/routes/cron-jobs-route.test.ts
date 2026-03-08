import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { CronJobsRepository } from '../../persistence/repos/cron-jobs-repo'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { registerCronJobsRoute } from './cron-jobs-route'

describe('cron jobs route', () => {
  let db: AppDatabase
  let app: Hono
  let assistantsRepo: AssistantsRepository
  let providersRepo: ProvidersRepository
  let threadsRepo: ThreadsRepository
  let cronJobsRepo: CronJobsRepository
  let schedulerReload: ReturnType<typeof vi.fn<() => Promise<void>>>

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    assistantsRepo = new AssistantsRepository(db)
    providersRepo = new ProvidersRepository(db)
    threadsRepo = new ThreadsRepository(db)
    cronJobsRepo = new CronJobsRepository(db)
    schedulerReload = vi.fn(async (): Promise<void> => undefined)
    app = new Hono()
    registerCronJobsRoute(app, {
      cronJobsRepo,
      assistantsRepo,
      threadsRepo,
      cronSchedulerService: {
        reload: schedulerReload
      }
    })
  })

  afterEach(() => {
    db.close()
  })

  async function createWorkspaceAssistant(name: string, rootPath: string) {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })

    return assistantsRepo.create({
      name,
      providerId: provider.id,
      workspaceConfig: {
        rootPath
      }
    })
  }

  it('creates a hidden cron thread when a cron job is created', async () => {
    const assistant = await createWorkspaceAssistant('Scheduler', '/tmp/workspace-a')

    const response = await app.request('http://localhost/v1/cron-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: assistant.id,
        name: 'Morning summary',
        prompt: 'Summarize the workspace status.',
        cronExpression: '0 9 * * 1-5'
      })
    })

    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created.threadId).toEqual(expect.any(String))

    const hiddenThread = await threadsRepo.getById(created.threadId)
    expect(hiddenThread).toMatchObject({
      assistantId: assistant.id,
      metadata: {
        cron: true,
        cronJobId: created.id
      }
    })
    expect(schedulerReload).toHaveBeenCalledTimes(1)
  })

  it('rotates the hidden cron thread when the assistant changes', async () => {
    const firstAssistant = await createWorkspaceAssistant('Scheduler A', '/tmp/workspace-a')
    const secondAssistant = await createWorkspaceAssistant('Scheduler B', '/tmp/workspace-b')

    const createResponse = await app.request('http://localhost/v1/cron-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: firstAssistant.id,
        name: 'Morning summary',
        prompt: 'Summarize the workspace status.',
        cronExpression: '0 9 * * 1-5'
      })
    })
    const created = await createResponse.json()

    const patchResponse = await app.request(`http://localhost/v1/cron-jobs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: secondAssistant.id
      })
    })

    expect(patchResponse.status).toBe(200)
    const updated = await patchResponse.json()
    expect(updated.threadId).not.toBe(created.threadId)

    await expect(threadsRepo.getById(created.threadId)).resolves.toBeNull()
    await expect(threadsRepo.getById(updated.threadId)).resolves.toMatchObject({
      assistantId: secondAssistant.id,
      metadata: {
        cron: true,
        cronJobId: created.id
      }
    })
    expect(schedulerReload).toHaveBeenCalledTimes(2)
  })

  it('deletes the hidden thread and reloads the scheduler when a cron job is removed', async () => {
    const assistant = await createWorkspaceAssistant('Scheduler', '/tmp/workspace-a')

    const createResponse = await app.request('http://localhost/v1/cron-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: assistant.id,
        name: 'Morning summary',
        prompt: 'Summarize the workspace status.',
        cronExpression: '0 9 * * 1-5'
      })
    })
    const created = await createResponse.json()

    const deleteResponse = await app.request(`http://localhost/v1/cron-jobs/${created.id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(204)
    await expect(threadsRepo.getById(created.threadId)).resolves.toBeNull()
    await expect(cronJobsRepo.getById(created.id)).resolves.toBeNull()
    expect(schedulerReload).toHaveBeenCalledTimes(2)
  })

  it('rejects assistants without workspaces and invalid cron expressions', async () => {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const assistantWithoutWorkspace = await assistantsRepo.create({
      name: 'No Workspace',
      providerId: provider.id,
      workspaceConfig: {}
    })
    const workspaceAssistant = await assistantsRepo.create({
      name: 'Workspace Assistant',
      providerId: provider.id,
      workspaceConfig: {
        rootPath: '/tmp/workspace-a'
      }
    })

    const missingWorkspaceResponse = await app.request('http://localhost/v1/cron-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: assistantWithoutWorkspace.id,
        name: 'Morning summary',
        prompt: 'Summarize the workspace status.',
        cronExpression: '0 9 * * 1-5'
      })
    })
    expect(missingWorkspaceResponse.status).toBe(400)
    await expect(missingWorkspaceResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Assistant workspace is required for cron jobs'
    })

    const invalidCronResponse = await app.request('http://localhost/v1/cron-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: workspaceAssistant.id,
        name: 'Morning summary',
        prompt: 'Summarize the workspace status.',
        cronExpression: 'invalid cron'
      })
    })
    expect(invalidCronResponse.status).toBe(400)
    await expect(invalidCronResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid cron expression'
    })
  })
})
