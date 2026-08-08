import { stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  AppStoredWorkspace,
  CreateWorkspaceRecordInput,
  WorkspaceRecordsRepository
} from './workspace-records-repo'

const BUILT_IN_CHATS_WORKSPACE_NAME = 'Chats'
const BUILT_IN_CHATS_DIRECTORY = 'chats'
const BUILT_IN_WORKSPACES_DIRECTORY = 'workspaces'

export type AppWorkspace = {
  id: string
  name: string
  rootPath: string
  createdAt: string
  updatedAt: string
  builtInKind: 'chats' | null
  isMissing: boolean
}

export type CreateWorkspaceInput = CreateWorkspaceRecordInput
export type UpdateWorkspaceInput = { name?: string; rootPath?: string }
export type RelocateWorkspaceInput = { rootPath: string }

type WorkspacesRepositoryOptions = {
  workspaceRecordsRepo: Pick<
    WorkspaceRecordsRepository,
    | 'create'
    | 'delete'
    | 'findByRootPath'
    | 'getBuiltInDefaultWorkspaceId'
    | 'getById'
    | 'isBuiltInDefaultWorkspace'
    | 'list'
    | 'setBuiltInDefaultWorkspaceId'
    | 'update'
  >
  builtInChatsRootPath: string
  /**
   * Root path changes are rejected while a workspace has persisted threads. Existing
   * runtimes keep their original cwd, so silently changing the record would break the
   * workspace boundary for those threads.
   */
  hasAgentSessions?: (workspaceId: string) => Promise<boolean>
}

async function toWorkspace(
  workspace: AppStoredWorkspace,
  builtInWorkspaceId: string | null
): Promise<AppWorkspace> {
  let isMissing = false
  if (workspace.id !== builtInWorkspaceId) {
    try {
      isMissing = !(await stat(workspace.rootPath)).isDirectory()
    } catch {
      isMissing = true
    }
  }
  return {
    id: workspace.id,
    name: workspace.id === builtInWorkspaceId ? BUILT_IN_CHATS_WORKSPACE_NAME : workspace.name,
    rootPath: workspace.rootPath,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    builtInKind: workspace.id === builtInWorkspaceId ? 'chats' : null,
    isMissing
  }
}

export function resolveBuiltInChatsWorkspacePath(userDataPath: string): string {
  return path.join(userDataPath, BUILT_IN_WORKSPACES_DIRECTORY, BUILT_IN_CHATS_DIRECTORY)
}

export class WorkspacesRepository {
  constructor(private readonly options: WorkspacesRepositoryOptions) {}

  async ensureBuiltInChatsWorkspace(): Promise<AppWorkspace> {
    const storedId = await this.options.workspaceRecordsRepo.getBuiltInDefaultWorkspaceId()
    let workspace = storedId
      ? await this.options.workspaceRecordsRepo.getById(storedId)
      : await this.options.workspaceRecordsRepo.findByRootPath(this.options.builtInChatsRootPath)
    if (!workspace) {
      workspace = await this.options.workspaceRecordsRepo.create({
        name: BUILT_IN_CHATS_WORKSPACE_NAME,
        rootPath: this.options.builtInChatsRootPath
      })
    }
    await this.options.workspaceRecordsRepo.setBuiltInDefaultWorkspaceId(workspace.id)
    if (
      workspace.name !== BUILT_IN_CHATS_WORKSPACE_NAME ||
      workspace.rootPath !== this.options.builtInChatsRootPath
    ) {
      const updated = await this.options.workspaceRecordsRepo.update(workspace.id, {
        name: BUILT_IN_CHATS_WORKSPACE_NAME,
        rootPath: this.options.builtInChatsRootPath
      })
      if (!updated) throw new Error('Failed to normalize built-in Chats workspace')
      workspace = updated
    }
    return toWorkspace(workspace, workspace.id)
  }

  async list(): Promise<AppWorkspace[]> {
    const builtIn = await this.ensureBuiltInChatsWorkspace()
    return Promise.all(
      (await this.options.workspaceRecordsRepo.list()).map((workspace) =>
        toWorkspace(workspace, builtIn.id)
      )
    )
  }

  async getById(id: string): Promise<AppWorkspace | null> {
    const workspace = await this.options.workspaceRecordsRepo.getById(id)
    if (!workspace) return null
    return toWorkspace(
      workspace,
      await this.options.workspaceRecordsRepo.getBuiltInDefaultWorkspaceId()
    )
  }

  async create(input: CreateWorkspaceInput): Promise<AppWorkspace> {
    const builtIn = await this.ensureBuiltInChatsWorkspace()
    if (await this.options.workspaceRecordsRepo.findByRootPath(input.rootPath)) {
      throw new Error('A workspace already uses this root path')
    }
    return toWorkspace(await this.options.workspaceRecordsRepo.create(input), builtIn.id)
  }

  async relocate(id: string, input: RelocateWorkspaceInput): Promise<AppWorkspace | null> {
    return this.update(id, input)
  }

  async update(id: string, input: UpdateWorkspaceInput): Promise<AppWorkspace | null> {
    if (input.rootPath) {
      const existing = await this.options.workspaceRecordsRepo.getById(id)
      if (!existing) return null
      if (
        existing.rootPath !== input.rootPath &&
        (await this.options.hasAgentSessions?.(id))
      ) {
        throw new Error('Close or remove existing threads before changing the workspace root path')
      }
      const duplicate = await this.options.workspaceRecordsRepo.findByRootPath(input.rootPath)
      if (duplicate && duplicate.id !== id) {
        throw new Error('A workspace already uses this root path')
      }
    }
    const updated = await this.options.workspaceRecordsRepo.update(id, input)
    if (!updated) return null
    return toWorkspace(
      updated,
      await this.options.workspaceRecordsRepo.getBuiltInDefaultWorkspaceId()
    )
  }

  async delete(id: string): Promise<'deleted' | 'built-in' | 'missing'> {
    if (await this.options.workspaceRecordsRepo.isBuiltInDefaultWorkspace(id)) return 'built-in'
    return (await this.options.workspaceRecordsRepo.delete(id)) ? 'deleted' : 'missing'
  }
}
