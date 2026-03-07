import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { TeamWorkspacesRepository } from '../../persistence/repos/team-workspaces-repo'
import { registerTeamWorkspacesRoute } from './team-workspaces-route'

describe('team workspaces route', () => {
  let db: AppDatabase
  let app: Hono
  let teamWorkspacesRepo: TeamWorkspacesRepository
  let providersRepo: ProvidersRepository
  let providerId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    teamWorkspacesRepo = new TeamWorkspacesRepository(db)
    providersRepo = new ProvidersRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    providerId = provider.id
    app = new Hono()
    registerTeamWorkspacesRoute(app, { teamWorkspacesRepo, providersRepo })
  })

  afterEach(() => {
    db.close()
  })

  it('creates, lists, updates, and deletes a team workspace', async () => {
    const createResponse = await app.request('http://localhost/v1/team/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Docs Workspace',
        rootPath: '/Users/demo/project'
      })
    })

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created).toMatchObject({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })

    const listResponse = await app.request('http://localhost/v1/team/workspaces')
    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'Docs Workspace'
      })
    ])

    const patchResponse = await app.request(
      `http://localhost/v1/team/workspaces/${created.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Release Workspace',
          rootPath: '/Users/demo/release',
          teamDescription: 'Coordinate docs release',
          supervisorProviderId: providerId,
          supervisorModel: 'gpt-5'
        })
      }
    )

    expect(patchResponse.status).toBe(200)
    await expect(patchResponse.json()).resolves.toMatchObject({
      id: created.id,
      name: 'Release Workspace',
      rootPath: '/Users/demo/release',
      teamDescription: 'Coordinate docs release',
      supervisorProviderId: providerId,
      supervisorModel: 'gpt-5'
    })

    const deleteResponse = await app.request(
      `http://localhost/v1/team/workspaces/${created.id}`,
      {
        method: 'DELETE'
      }
    )

    expect(deleteResponse.status).toBe(204)
    await expect(teamWorkspacesRepo.list()).resolves.toEqual([])
  })

  it('lists and replaces workspace members', async () => {
    const workspace = await teamWorkspacesRepo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })

    const updateResponse = await app.request(
      `http://localhost/v1/team/workspaces/${workspace.id}/members`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantIds: ['assistant-2', 'assistant-1', 'assistant-2']
        })
      }
    )

    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toEqual([
      expect.objectContaining({
        workspaceId: workspace.id,
        assistantId: 'assistant-2',
        sortOrder: 0
      }),
      expect.objectContaining({
        workspaceId: workspace.id,
        assistantId: 'assistant-1',
        sortOrder: 1
      })
    ])

    const listResponse = await app.request(
      `http://localhost/v1/team/workspaces/${workspace.id}/members`
    )

    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        workspaceId: workspace.id,
        assistantId: 'assistant-2',
        sortOrder: 0
      }),
      expect.objectContaining({
        workspaceId: workspace.id,
        assistantId: 'assistant-1',
        sortOrder: 1
      })
    ])
  })

  it('rejects invalid workspace payloads', async () => {
    const response = await app.request('http://localhost/v1/team/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '',
        rootPath: ''
      })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.any(String)
    })

    const updateResponse = await app.request('http://localhost/v1/team/workspaces/workspace-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supervisorModel: 'gpt-5'
      })
    })

    expect(updateResponse.status).toBe(400)
  })
})
