import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../persistence/client'
import { migrateAppSchema } from '../../persistence/migrate'
import { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import { ThreadsRepository } from '../../persistence/repos/threads-repo'
import { WorkspaceRecordsRepository } from '../../persistence/repos/workspace-records-repo'
import {
  resolveBuiltInChatsWorkspacePath,
  WorkspacesRepository
} from '../../persistence/repos/workspaces-repo'
import { registerWorkspacesRoute } from './workspaces-route'

describe('workspaces route', () => {
  let db: AppDatabase
  let assistantsRepo: AssistantsRepository
  let app: Hono
  let threadsRepo: ThreadsRepository
  let workspacesRepo: WorkspacesRepository
  const userDataPath = '/tmp/tia-studio-tests'

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    assistantsRepo = new AssistantsRepository(db)
    threadsRepo = new ThreadsRepository(db)
    workspacesRepo = new WorkspacesRepository({
      assistantsRepo,
      workspaceRecordsRepo: new WorkspaceRecordsRepository(db),
      threadsRepo,
      builtInChatsRootPath: resolveBuiltInChatsWorkspacePath(userDataPath)
    })
    app = new Hono()
    registerWorkspacesRoute(app, { workspacesRepo })
  })

  afterEach(() => {
    db.close()
  })

  it('lists the built-in Chats workspace in workspace-first language', async () => {
    const response = await app.request('http://localhost/v1/workspaces')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        name: 'Chats',
        rootPath: resolveBuiltInChatsWorkspacePath(userDataPath),
        builtInKind: 'chats'
      })
    ])
  })

  it('creates and relocates a named workspace', async () => {
    const createResponse = await app.request('http://localhost/v1/workspaces', {
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
      rootPath: '/Users/demo/project',
      builtInKind: null,
      defaultAssistantId: expect.any(String),
      isMissing: true
    })

    const relocateResponse = await app.request(`http://localhost/v1/workspaces/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rootPath: '/Users/demo/project-relocated'
      })
    })

    expect(relocateResponse.status).toBe(200)
    await expect(relocateResponse.json()).resolves.toMatchObject({
      id: created.id,
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project-relocated',
      builtInKind: null,
      defaultAssistantId: created.defaultAssistantId
    })
  })

  it('deletes named workspaces and protects the built-in Chats workspace', async () => {
    const created = await workspacesRepo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })
    const [builtInWorkspace] = await workspacesRepo.list()

    const deleteBuiltInResponse = await app.request(
      `http://localhost/v1/workspaces/${builtInWorkspace.id}`,
      {
        method: 'DELETE'
      }
    )

    expect(deleteBuiltInResponse.status).toBe(409)
    await expect(deleteBuiltInResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Built-in Chats workspace cannot be deleted'
    })

    const deleteResponse = await app.request(`http://localhost/v1/workspaces/${created.id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(204)
    await expect(assistantsRepo.getById(created.defaultAssistantId!)).resolves.toBeNull()
    const listResponse = await app.request('http://localhost/v1/workspaces')
    const workspaces = await listResponse.json()
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]).toMatchObject({
      id: builtInWorkspace.id,
      builtInKind: 'chats'
    })
  })

  it('blocks relocating the built-in Chats workspace', async () => {
    const [builtInWorkspace] = await workspacesRepo.list()

    const response = await app.request(`http://localhost/v1/workspaces/${builtInWorkspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rootPath: '/Users/demo/other-chats-root'
      })
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Built-in Chats workspace cannot be relocated'
    })
  })

  it('rejects invalid workspace payloads', async () => {
    const createResponse = await app.request('http://localhost/v1/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '',
        rootPath: ''
      })
    })

    expect(createResponse.status).toBe(400)
    await expect(createResponse.json()).resolves.toEqual({
      ok: false,
      error: expect.any(String)
    })

    const relocateResponse = await app.request('http://localhost/v1/workspaces/workspace-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rootPath: ''
      })
    })

    expect(relocateResponse.status).toBe(400)
  })
})
