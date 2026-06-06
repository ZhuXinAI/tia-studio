import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { ThreadsRepository } from './threads-repo'
import { WorkspaceRecordsRepository } from './workspace-records-repo'
import { resolveBuiltInChatsWorkspacePath, WorkspacesRepository } from './workspaces-repo'

describe('WorkspacesRepository', () => {
  let db: AppDatabase
  let assistantsRepo: AssistantsRepository
  let workspaceRecordsRepo: WorkspaceRecordsRepository
  let threadsRepo: ThreadsRepository
  let repo: WorkspacesRepository
  const userDataPath = '/tmp/tia-studio-tests'

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    assistantsRepo = new AssistantsRepository(db)
    workspaceRecordsRepo = new WorkspaceRecordsRepository(db)
    threadsRepo = new ThreadsRepository(db)
    repo = new WorkspacesRepository({
      assistantsRepo,
      workspaceRecordsRepo,
      threadsRepo,
      builtInChatsRootPath: resolveBuiltInChatsWorkspacePath(userDataPath)
    })
  })

  afterEach(() => {
    db.close()
  })

  it('ensures and lists the built-in Chats workspace', async () => {
    const workspaces = await repo.list()

    expect(workspaces).toEqual([
      expect.objectContaining({
        name: 'Chats',
        rootPath: resolveBuiltInChatsWorkspacePath(userDataPath),
        builtInKind: 'chats'
      })
    ])
  })

  it('normalizes a stored built-in workspace into Chats language', async () => {
    const legacyWorkspace = await workspaceRecordsRepo.create({
      name: 'Default Team',
      rootPath: '/tmp/legacy-default-team'
    })
    await workspaceRecordsRepo.setBuiltInDefaultWorkspaceId(legacyWorkspace.id)

    const workspace = await repo.ensureBuiltInChatsWorkspace()

    expect(workspace).toMatchObject({
      id: legacyWorkspace.id,
      name: 'Chats',
      rootPath: resolveBuiltInChatsWorkspacePath(userDataPath),
      builtInKind: 'chats'
    })
  })

  it('creates named workspaces alongside the built-in Chats workspace', async () => {
    const created = await repo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })

    expect(created).toMatchObject({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project',
      builtInKind: null,
      defaultAssistantId: expect.any(String),
      isMissing: true
    })

    const workspaces = await repo.list()
    expect(workspaces).toHaveLength(2)
    expect(workspaces[0]).toMatchObject({
      name: 'Chats',
      builtInKind: 'chats'
    })
    expect(workspaces[1]).toMatchObject({
      id: created.id,
      name: 'Docs Workspace',
      builtInKind: null,
      defaultAssistantId: created.defaultAssistantId
    })
  })

  it('relocates named workspaces without changing their workspace-first response shape', async () => {
    const created = await repo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })

    const relocated = await repo.relocate(created.id, {
      rootPath: '/Users/demo/project-renamed'
    })

    expect(relocated).toMatchObject({
      id: created.id,
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project-renamed',
      builtInKind: null,
      defaultAssistantId: created.defaultAssistantId
    })
  })

  it('deletes named workspace threads and its hidden workspace assistant', async () => {
    const workspace = await repo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })

    await threadsRepo.create({
      assistantId: workspace.defaultAssistantId!,
      resourceId: 'default-profile',
      title: 'Workspace thread',
      metadata: {
        workspaceId: workspace.id
      }
    })

    await expect(repo.delete(workspace.id)).resolves.toBe('deleted')
    await expect(assistantsRepo.getById(workspace.defaultAssistantId!)).resolves.toBeNull()
    await expect(threadsRepo.listByWorkspace(workspace.id)).resolves.toEqual([])
  })

  it('blocks deleting the built-in Chats workspace', async () => {
    const [builtInWorkspace] = await repo.list()

    await expect(repo.delete(builtInWorkspace.id)).resolves.toBe('built-in')
  })
})
