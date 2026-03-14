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
  let groupsRepo: GroupWorkspacesRepository
  let groupId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    groupThreadsRepo = new GroupThreadsRepository(db)
    groupsRepo = new GroupWorkspacesRepository(db)
    const group = await groupsRepo.create({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })
    groupId = group.id
    app = new Hono()
    registerGroupThreadsRoute(app, {
      groupThreadsRepo,
      groupsRepo
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
        groupId,
        resourceId: 'default-profile'
      })
    })

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()

    const listResponse = await app.request(`http://localhost/v1/group/threads?groupId=${groupId}`)

    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        groupId,
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
      groupId,
      title: 'Launch room'
    })

    const deleteResponse = await app.request(`http://localhost/v1/group/threads/${created.id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(204)
    await expect(groupThreadsRepo.listByWorkspace(groupId)).resolves.toEqual([])
  })

  it('rejects invalid thread payloads', async () => {
    const createResponse = await app.request('http://localhost/v1/group/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: '',
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

  it('rejects missing groups', async () => {
    const response = await app.request('http://localhost/v1/group/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: 'missing-group',
        resourceId: 'default-profile'
      })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Group not found'
    })
  })
})
