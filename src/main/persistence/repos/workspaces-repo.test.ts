import { describe, expect, it, vi } from 'vitest'
import { WorkspacesRepository } from './workspaces-repo'

describe('WorkspacesRepository', () => {
  it('does not move a workspace while persisted threads still reference its old cwd', async () => {
    const update = vi.fn()
    const workspaceRecordsRepo = {
      getById: vi.fn(async () => ({
        id: 'workspace-1',
        name: 'Project',
        rootPath: '/tmp/project',
        description: '',
        supervisorProviderId: null,
        supervisorModel: '',
        createdAt: '',
        updatedAt: ''
      })),
      findByRootPath: vi.fn(async () => null),
      update,
      getBuiltInDefaultWorkspaceId: vi.fn(async () => null),
      setBuiltInDefaultWorkspaceId: vi.fn(async () => undefined),
      isBuiltInDefaultWorkspace: vi.fn(async () => false),
      list: vi.fn(async () => []),
      create: vi.fn(),
      delete: vi.fn()
    }
    const hasAgentSessions = vi.fn(async () => true)
    const repository = new WorkspacesRepository({
      workspaceRecordsRepo: workspaceRecordsRepo as never,
      builtInChatsRootPath: '/tmp/chats',
      hasAgentSessions
    })

    await expect(repository.update('workspace-1', { rootPath: '/tmp/moved' })).rejects.toThrow(
      'Close or remove existing threads before changing the workspace root path'
    )
    expect(hasAgentSessions).toHaveBeenCalledWith('workspace-1')
    expect(update).not.toHaveBeenCalled()
  })
})
