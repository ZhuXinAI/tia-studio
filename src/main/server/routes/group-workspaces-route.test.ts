import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { GroupWorkspacesRepository } from '../../persistence/repos/group-workspaces-repo'
import { registerGroupWorkspacesRoute } from './group-workspaces-route'

describe('group workspaces route', () => {
  let db: AppDatabase
  let app: Hono
  let groupWorkspacesRepo: GroupWorkspacesRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    groupWorkspacesRepo = new GroupWorkspacesRepository(db)
    app = new Hono()
    registerGroupWorkspacesRoute(app, { groupWorkspacesRepo })
  })

  afterEach(() => {
    db.close()
  })

  it('creates, lists, updates, and deletes a group workspace', async () => {
    const createResponse = await app.request('http://localhost/v1/group/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Launch Group',
        rootPath: '/Users/demo/project'
      })
    })

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created).toMatchObject({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })

    const listResponse = await app.request('http://localhost/v1/group/workspaces')
    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'Launch Group'
      })
    ])

    const patchResponse = await app.request(`http://localhost/v1/group/workspaces/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Research Group',
        rootPath: '/Users/demo/research',
        groupDescription: 'Brainstorm a launch plan',
        maxAutoTurns: 8
      })
    })

    expect(patchResponse.status).toBe(200)
    await expect(patchResponse.json()).resolves.toMatchObject({
      id: created.id,
      name: 'Research Group',
      rootPath: '/Users/demo/research',
      groupDescription: 'Brainstorm a launch plan',
      maxAutoTurns: 8
    })

    const deleteResponse = await app.request(`http://localhost/v1/group/workspaces/${created.id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(204)
    await expect(groupWorkspacesRepo.list()).resolves.toEqual([])
  })

  it('lists and replaces group workspace members', async () => {
    const workspace = await groupWorkspacesRepo.create({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })

    const updateResponse = await app.request(
      `http://localhost/v1/group/workspaces/${workspace.id}/members`,
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
      `http://localhost/v1/group/workspaces/${workspace.id}/members`
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
    const response = await app.request('http://localhost/v1/group/workspaces', {
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

    const updateResponse = await app.request('http://localhost/v1/group/workspaces/workspace-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maxAutoTurns: 0
      })
    })

    expect(updateResponse.status).toBe(400)
  })
})
