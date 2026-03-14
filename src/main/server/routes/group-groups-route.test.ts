import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { GroupWorkspacesRepository } from '../../persistence/repos/group-workspaces-repo'
import { registerGroupGroupsRoute } from './group-groups-route'

describe('group groups route', () => {
  let db: AppDatabase
  let app: Hono
  let groupsRepo: GroupWorkspacesRepository

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    groupsRepo = new GroupWorkspacesRepository(db)
    app = new Hono()
    registerGroupGroupsRoute(app, { groupsRepo })
  })

  afterEach(() => {
    db.close()
  })

  it('creates, lists, updates, and deletes a group', async () => {
    const createResponse = await app.request('http://localhost/v1/group/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Launch Group',
        assistantIds: ['assistant-1', 'assistant-2']
      })
    })

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created).toMatchObject({
      name: 'Launch Group',
      rootPath: ''
    })

    await expect(groupsRepo.listMembers(created.id)).resolves.toEqual([
      expect.objectContaining({
        workspaceId: created.id,
        assistantId: 'assistant-1',
        sortOrder: 0
      }),
      expect.objectContaining({
        workspaceId: created.id,
        assistantId: 'assistant-2',
        sortOrder: 1
      })
    ])

    const listResponse = await app.request('http://localhost/v1/group/groups')
    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'Launch Group'
      })
    ])

    const patchResponse = await app.request(`http://localhost/v1/group/groups/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Research Group',
        groupDescription: 'Brainstorm a launch plan',
        maxAutoTurns: 8
      })
    })

    expect(patchResponse.status).toBe(200)
    await expect(patchResponse.json()).resolves.toMatchObject({
      id: created.id,
      name: 'Research Group',
      rootPath: '',
      groupDescription: 'Brainstorm a launch plan',
      maxAutoTurns: 8
    })

    const deleteResponse = await app.request(`http://localhost/v1/group/groups/${created.id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(204)
    await expect(groupsRepo.list()).resolves.toEqual([])
  })

  it('lists and replaces group members', async () => {
    const group = await groupsRepo.create({
      name: 'Launch Group',
      rootPath: '/Users/demo/project'
    })

    const updateResponse = await app.request(
      `http://localhost/v1/group/groups/${group.id}/members`,
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
        groupId: group.id,
        assistantId: 'assistant-2',
        sortOrder: 0
      }),
      expect.objectContaining({
        groupId: group.id,
        assistantId: 'assistant-1',
        sortOrder: 1
      })
    ])

    const listResponse = await app.request(`http://localhost/v1/group/groups/${group.id}/members`)

    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        groupId: group.id,
        assistantId: 'assistant-2',
        sortOrder: 0
      }),
      expect.objectContaining({
        groupId: group.id,
        assistantId: 'assistant-1',
        sortOrder: 1
      })
    ])
  })

  it('rejects invalid group payloads', async () => {
    const response = await app.request('http://localhost/v1/group/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '',
        assistantIds: []
      })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.any(String)
    })

    const updateResponse = await app.request('http://localhost/v1/group/groups/group-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maxAutoTurns: 0
      })
    })

    expect(updateResponse.status).toBe(400)
  })
})
