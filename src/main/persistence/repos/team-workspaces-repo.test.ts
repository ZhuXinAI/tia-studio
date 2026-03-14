import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { AssistantsRepository } from './assistants-repo'
import { ProvidersRepository } from './providers-repo'
import { TeamThreadsRepository } from './team-threads-repo'
import { TeamWorkspacesRepository } from './team-workspaces-repo'

describe('TeamWorkspacesRepository', () => {
  let db: AppDatabase
  let repo: TeamWorkspacesRepository
  let teamThreadsRepo: TeamThreadsRepository
  let providersRepo: ProvidersRepository
  let assistantsRepo: AssistantsRepository
  let providerId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new TeamWorkspacesRepository(db)
    teamThreadsRepo = new TeamThreadsRepository(db)
    providersRepo = new ProvidersRepository(db)
    assistantsRepo = new AssistantsRepository(db)
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    providerId = provider.id
  })

  afterEach(() => {
    db.close()
  })

  it('creates and lists team workspaces', async () => {
    await repo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })

    const workspaces = await repo.list()

    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]).toMatchObject({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project',
      teamDescription: '',
      supervisorProviderId: null,
      supervisorModel: ''
    })
  })

  it('updates workspace-owned team configuration', async () => {
    const workspace = await repo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })

    const updated = await repo.update(workspace.id, {
      name: 'Release Workspace',
      rootPath: '/Users/demo/release',
      teamDescription: 'Coordinate docs release',
      supervisorProviderId: providerId,
      supervisorModel: 'gpt-5'
    })

    expect(updated).toMatchObject({
      id: workspace.id,
      name: 'Release Workspace',
      rootPath: '/Users/demo/release',
      teamDescription: 'Coordinate docs release',
      supervisorProviderId: providerId,
      supervisorModel: 'gpt-5'
    })
  })

  it('replaces workspace members in order', async () => {
    const workspace = await repo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })

    await repo.replaceMembers(workspace.id, ['assistant-2', 'assistant-1'])

    const members = await repo.listMembers(workspace.id)
    expect(members.map((member) => member.assistantId)).toEqual(['assistant-2', 'assistant-1'])
    expect(members.map((member) => member.sortOrder)).toEqual([0, 1])
  })

  it('derives built-in default workspace members from all assistants', async () => {
    const workspace = await repo.create({
      name: 'Default Team',
      rootPath: '/Users/demo/default_root/default_team'
    })
    await repo.setBuiltInDefaultWorkspaceId(workspace.id)

    await assistantsRepo.create({
      name: 'Planner',
      providerId,
      enabled: true
    })
    await assistantsRepo.create({
      name: 'Researcher',
      providerId,
      enabled: true
    })

    const members = await repo.listMembers(workspace.id)

    expect(members).toHaveLength(2)
    expect(members.map((member) => member.assistantId)).toHaveLength(2)
    expect(members.map((member) => member.sortOrder)).toEqual([0, 1])
  })

  it('deletes team workspaces and cascades to team threads and workspace members', async () => {
    const workspace = await repo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })
    const thread = await teamThreadsRepo.create({
      workspaceId: workspace.id,
      resourceId: 'default-profile',
      title: 'Release team'
    })

    await repo.replaceMembers(workspace.id, ['assistant-2', 'assistant-1'])

    const deleted = await repo.delete(workspace.id)

    expect(deleted).toBe(true)
    await expect(teamThreadsRepo.getById(thread.id)).resolves.toBeNull()
    await expect(repo.listMembers(workspace.id)).resolves.toEqual([])
    await expect(repo.list()).resolves.toEqual([])
  })
})
