import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { TeamThreadsRepository } from '../../persistence/repos/team-threads-repo'
import { TeamWorkspacesRepository } from '../../persistence/repos/team-workspaces-repo'
import { registerTeamThreadsRoute } from './team-threads-route'

describe('team threads route', () => {
  let db: AppDatabase
  let app: Hono
  let teamThreadsRepo: TeamThreadsRepository
  let teamWorkspacesRepo: TeamWorkspacesRepository
  let providersRepo: ProvidersRepository
  let workspaceId: string
  let providerId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    teamThreadsRepo = new TeamThreadsRepository(db)
    teamWorkspacesRepo = new TeamWorkspacesRepository(db)
    providersRepo = new ProvidersRepository(db)
    const workspace = await teamWorkspacesRepo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    workspaceId = workspace.id
    providerId = provider.id
    app = new Hono()
    registerTeamThreadsRoute(app, {
      teamThreadsRepo,
      teamWorkspacesRepo,
      providersRepo
    })
  })

  afterEach(() => {
    db.close()
  })

  it('creates, lists, updates, and deletes team threads', async () => {
    const createResponse = await app.request('http://localhost/v1/team/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        resourceId: 'default-profile'
      })
    })

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()

    const listResponse = await app.request(
      `http://localhost/v1/team/threads?workspaceId=${workspaceId}`
    )

    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        title: ''
      })
    ])

    const patchResponse = await app.request(`http://localhost/v1/team/threads/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Launch team'
      })
    })

    expect(patchResponse.status).toBe(200)
    await expect(patchResponse.json()).resolves.toMatchObject({
      id: created.id,
      title: 'Launch team'
    })

    const deleteResponse = await app.request(`http://localhost/v1/team/threads/${created.id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(204)
    await expect(teamThreadsRepo.listByWorkspace(workspaceId)).resolves.toEqual([])
  })

  it('replaces team thread members with deduplicated ordered ids', async () => {
    const thread = await teamThreadsRepo.create({
      workspaceId,
      resourceId: 'default-profile',
      title: 'Release team'
    })

    const response = await app.request(
      `http://localhost/v1/team/threads/${thread.id}/members`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantIds: ['assistant-2', 'assistant-1', 'assistant-2']
        })
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ assistantId: 'assistant-2', sortOrder: 0 }),
      expect.objectContaining({ assistantId: 'assistant-1', sortOrder: 1 })
    ])
  })

  it('lists team thread members for existing threads', async () => {
    const thread = await teamThreadsRepo.create({
      workspaceId,
      resourceId: 'default-profile',
      title: 'Release team'
    })
    await teamThreadsRepo.replaceMembers(thread.id, ['assistant-2', 'assistant-1'])

    const response = await app.request(`http://localhost/v1/team/threads/${thread.id}/members`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        teamThreadId: thread.id,
        assistantId: 'assistant-2',
        sortOrder: 0
      }),
      expect.objectContaining({
        teamThreadId: thread.id,
        assistantId: 'assistant-1',
        sortOrder: 1
      })
    ])
  })

  it('rejects invalid thread payloads', async () => {
    const createResponse = await app.request('http://localhost/v1/team/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: '',
        resourceId: ''
      })
    })

    expect(createResponse.status).toBe(400)

    const updateResponse = await app.request('http://localhost/v1/team/threads/thread-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supervisorProviderId: providerId,
        supervisorModel: ''
      })
    })

    expect(updateResponse.status).toBe(400)
  })

  it('rejects missing workspaces and supervisor providers', async () => {
    const createResponse = await app.request('http://localhost/v1/team/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'missing-workspace',
        resourceId: 'default-profile'
      })
    })

    expect(createResponse.status).toBe(400)
    await expect(createResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Team workspace not found'
    })

    const thread = await teamThreadsRepo.create({
      workspaceId,
      resourceId: 'default-profile',
      title: 'Release team'
    })

    const updateResponse = await app.request(`http://localhost/v1/team/threads/${thread.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supervisorProviderId: 'missing-provider',
        supervisorModel: 'gpt-5'
      })
    })

    expect(updateResponse.status).toBe(400)
    await expect(updateResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Supervisor provider not found'
    })
  })
})
