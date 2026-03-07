import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { TeamWorkspacesRepository } from '../../persistence/repos/team-workspaces-repo'
import { registerTeamWorkspacesRoute } from './team-workspaces-route'

describe('team workspaces route', () => {
  let db: AppDatabase
  let app: Hono
  let teamWorkspacesRepo: TeamWorkspacesRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    teamWorkspacesRepo = new TeamWorkspacesRepository(db)
    app = new Hono()
    registerTeamWorkspacesRoute(app, { teamWorkspacesRepo })
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
          rootPath: '/Users/demo/release'
        })
      }
    )

    expect(patchResponse.status).toBe(200)
    await expect(patchResponse.json()).resolves.toMatchObject({
      id: created.id,
      name: 'Release Workspace',
      rootPath: '/Users/demo/release'
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
  })
})
