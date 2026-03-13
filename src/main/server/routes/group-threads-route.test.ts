import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { GroupThreadsRepository } from '../../persistence/repos/group-threads-repo'
import { GroupWorkspacesRepository } from '../../persistence/repos/group-workspaces-repo'
import { registerGroupThreadsRoute } from './group-threads-route'

describe('group threads route', () => {
  let db: AppDatabase
  let app: Hono
  let groupThreadsRepo: GroupThreadsRepository
  let groupWorkspacesRepo: GroupWorkspacesRepository
  let workspaceId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    groupThreadsRepo = new GroupThreadsRepository(db)
    groupWorkspacesRepo = new GroupWorkspacesRepository(db)
    const workspace = await groupWorkspacesRepo.create({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })
    workspaceId = workspace.id
    app = new Hono()
    registerGroupThreadsRoute(app, {
      groupThreadsRepo,
      groupWorkspacesRepo
    })
  })

  afterEach(() => {
    db.close()
  })

  it('creates, lists, updates, and deletes group threads', async () => {
    const createResponse = await app.request('http://localhost/v1/group/threads', {
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
      `http://localhost/v1/group/threads?workspaceId=${workspaceId}`
    )

    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        title: ''
      })
    ])

    const patchResponse = await app.request(`http://localhost/v1/group/threads/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Launch room'
      })
    })

    expect(patchResponse.status).toBe(200)
    await expect(patchResponse.json()).resolves.toMatchObject({
      id: created.id,
      title: 'Launch room'
    })

    const deleteResponse = await app.request(`http://localhost/v1/group/threads/${created.id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(204)
    await expect(groupThreadsRepo.listByWorkspace(workspaceId)).resolves.toEqual([])
  })

  it('rejects invalid thread payloads', async () => {
    const createResponse = await app.request('http://localhost/v1/group/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: '',
        resourceId: ''
      })
    })

    expect(createResponse.status).toBe(400)

    const updateResponse = await app.request('http://localhost/v1/group/threads/thread-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    expect(updateResponse.status).toBe(400)
  })

  it('rejects missing workspaces', async () => {
    const response = await app.request('http://localhost/v1/group/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'missing-workspace',
        resourceId: 'default-profile'
      })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Group workspace not found'
    })
  })
})
