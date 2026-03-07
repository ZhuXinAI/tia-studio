import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../client'
import { migrateAppSchema } from '../migrate'
import { ProvidersRepository } from './providers-repo'
import { TeamThreadsRepository } from './team-threads-repo'
import { TeamWorkspacesRepository } from './team-workspaces-repo'

describe('TeamThreadsRepository', () => {
  let db: AppDatabase
  let repo: TeamThreadsRepository
  let teamWorkspacesRepo: TeamWorkspacesRepository
  let providersRepo: ProvidersRepository
  let workspaceId: string

  beforeEach(async () => {
    db = await migrateAppSchema(':memory:')
    repo = new TeamThreadsRepository(db)
    teamWorkspacesRepo = new TeamWorkspacesRepository(db)
    providersRepo = new ProvidersRepository(db)
    const workspace = await teamWorkspacesRepo.create({
      name: 'Docs Workspace',
      rootPath: '/Users/demo/project'
    })
    workspaceId = workspace.id
  })

  afterEach(() => {
    db.close()
  })

  it('creates and lists team threads by workspace', async () => {
    await repo.create({
      workspaceId,
      resourceId: 'default-profile',
      title: 'Release team'
    })

    const threads = await repo.listByWorkspace(workspaceId)

    expect(threads).toHaveLength(1)
    expect(threads[0]).toMatchObject({
      workspaceId,
      resourceId: 'default-profile',
      title: 'Release team',
      teamDescription: '',
      supervisorProviderId: null,
      supervisorModel: '',
      lastMessageAt: null
    })
  })

  it('updates an existing team thread', async () => {
    const provider = await providersRepo.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      selectedModel: 'gpt-5'
    })
    const thread = await repo.create({
      workspaceId,
      resourceId: 'default-profile',
      title: 'Release team'
    })

    const updated = await repo.update(thread.id, {
      title: 'Launch team',
      teamDescription: 'Coordinate launch',
      supervisorProviderId: provider.id,
      supervisorModel: 'gpt-5'
    })

    expect(updated).toMatchObject({
      id: thread.id,
      title: 'Launch team',
      teamDescription: 'Coordinate launch',
      supervisorProviderId: provider.id,
      supervisorModel: 'gpt-5'
    })
  })

  it('replaces team thread members in order', async () => {
    const thread = await repo.create({
      workspaceId,
      resourceId: 'default-profile',
      title: 'Release team'
    })

    await repo.replaceMembers(thread.id, ['assistant-2', 'assistant-1'])

    const members = await repo.listMembers(thread.id)
    expect(members.map((member) => member.assistantId)).toEqual(['assistant-2', 'assistant-1'])
    expect(members.map((member) => member.sortOrder)).toEqual([0, 1])
  })

  it('touches last message timestamp for a team thread', async () => {
    const thread = await repo.create({
      workspaceId,
      resourceId: 'default-profile',
      title: 'Release team'
    })

    await repo.touchLastMessageAt(thread.id, '2026-03-07T12:00:00.000Z')

    await expect(repo.getById(thread.id)).resolves.toMatchObject({
      lastMessageAt: '2026-03-07T12:00:00.000Z'
    })
  })

  it('deletes a team thread and its membership rows', async () => {
    const thread = await repo.create({
      workspaceId,
      resourceId: 'default-profile',
      title: 'Release team'
    })
    await repo.replaceMembers(thread.id, ['assistant-2', 'assistant-1'])

    const deleted = await repo.delete(thread.id)

    expect(deleted).toBe(true)
    await expect(repo.getById(thread.id)).resolves.toBeNull()
    await expect(repo.listMembers(thread.id)).resolves.toEqual([])
  })
})
