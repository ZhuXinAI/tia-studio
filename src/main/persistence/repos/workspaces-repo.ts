import { access } from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_ASSISTANT_MAX_STEPS,
  WORKSPACE_DEFAULT_AGENT_MCP_KEY,
  type AppAssistant,
  type AssistantsRepository
} from './assistants-repo'
import type {
  AppStoredWorkspace,
  CreateWorkspaceRecordInput,
  WorkspaceRecordsRepository
} from './workspace-records-repo'
import type { ThreadsRepository } from './threads-repo'

const BUILT_IN_CHATS_WORKSPACE_NAME = 'Chats'
const BUILT_IN_CHATS_DIRECTORY = 'chats'
const BUILT_IN_WORKSPACES_DIRECTORY = 'workspaces'
const WORKSPACE_DEFAULT_AGENT_PROMPT =
  "You are TIA's hidden workspace agent. Use workspace tools, available global skills, and workspace skills to help with local development tasks."

export type AppWorkspace = {
  id: string
  name: string
  rootPath: string
  createdAt: string
  updatedAt: string
  builtInKind: 'chats' | null
  defaultAssistantId: string | null
  isMissing: boolean
}

export type CreateWorkspaceInput = CreateWorkspaceRecordInput

export type RelocateWorkspaceInput = {
  rootPath: string
}

type WorkspacesRepositoryOptions = {
  assistantsRepo: Pick<
    AssistantsRepository,
    'create' | 'delete' | 'findBuiltInDefault' | 'findWorkspaceDefaultByRootPath' | 'update'
  >
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
  threadsRepo: Pick<ThreadsRepository, 'deleteByWorkspace'>
  builtInChatsRootPath: string
}

async function checkWorkspaceMissing(
  workspace: AppStoredWorkspace,
  builtInWorkspaceId: string | null
) {
  if (workspace.id === builtInWorkspaceId) {
    return false
  }

  try {
    await access(workspace.rootPath)
    return false
  } catch {
    return true
  }
}

async function toWorkspace(
  workspace: AppStoredWorkspace,
  builtInWorkspaceId: string | null,
  defaultAssistantId: string | null
): Promise<AppWorkspace> {
  return {
    id: workspace.id,
    name: workspace.id === builtInWorkspaceId ? BUILT_IN_CHATS_WORKSPACE_NAME : workspace.name,
    rootPath: workspace.rootPath,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    builtInKind: workspace.id === builtInWorkspaceId ? 'chats' : null,
    defaultAssistantId,
    isMissing: await checkWorkspaceMissing(workspace, builtInWorkspaceId)
  }
}

function toWorkspaceDefaultAssistantName(workspace: AppStoredWorkspace): string {
  return workspace.name
}

export function resolveBuiltInChatsWorkspacePath(userDataPath: string): string {
  return path.join(userDataPath, BUILT_IN_WORKSPACES_DIRECTORY, BUILT_IN_CHATS_DIRECTORY)
}

export class WorkspacesRepository {
  constructor(private readonly options: WorkspacesRepositoryOptions) {}

  private async ensureNamedWorkspaceDefaultAssistant(
    workspace: AppStoredWorkspace
  ): Promise<AppAssistant> {
    const existingAssistant = await this.options.assistantsRepo.findWorkspaceDefaultByRootPath(
      workspace.rootPath
    )
    if (existingAssistant) {
      return existingAssistant
    }

    return this.options.assistantsRepo.create({
      name: toWorkspaceDefaultAssistantName(workspace),
      instructions: WORKSPACE_DEFAULT_AGENT_PROMPT,
      enabled: true,
      providerId: null,
      workspaceConfig: {
        rootPath: workspace.rootPath
      },
      skillsConfig: {},
      mcpConfig: {
        [WORKSPACE_DEFAULT_AGENT_MCP_KEY]: true
      },
      maxSteps: DEFAULT_ASSISTANT_MAX_STEPS
    })
  }

  private async resolveWorkspaceDefaultAssistantId(
    workspace: AppStoredWorkspace,
    builtInWorkspaceId: string | null
  ): Promise<string | null> {
    if (workspace.id === builtInWorkspaceId) {
      const assistant = await this.options.assistantsRepo.findBuiltInDefault()
      return assistant?.id ?? null
    }

    const assistant = await this.ensureNamedWorkspaceDefaultAssistant(workspace)
    return assistant.id
  }

  async ensureBuiltInChatsWorkspace(): Promise<AppWorkspace> {
    const storedWorkspaceId = await this.options.workspaceRecordsRepo.getBuiltInDefaultWorkspaceId()
    let workspace = storedWorkspaceId
      ? await this.options.workspaceRecordsRepo.getById(storedWorkspaceId)
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
      workspace = await this.options.workspaceRecordsRepo.update(workspace.id, {
        name: BUILT_IN_CHATS_WORKSPACE_NAME,
        rootPath: this.options.builtInChatsRootPath
      })

      if (!workspace) {
        throw new Error('Failed to normalize built-in Chats workspace')
      }
    }

    const defaultAssistantId = (await this.options.assistantsRepo.findBuiltInDefault())?.id ?? null
    return toWorkspace(workspace, workspace.id, defaultAssistantId)
  }

  async list(): Promise<AppWorkspace[]> {
    const builtInWorkspace = await this.ensureBuiltInChatsWorkspace()
    const workspaces = await this.options.workspaceRecordsRepo.list()
    return Promise.all(
      workspaces.map(async (workspace) => {
        const defaultAssistantId = await this.resolveWorkspaceDefaultAssistantId(
          workspace,
          builtInWorkspace.id
        )
        return toWorkspace(workspace, builtInWorkspace.id, defaultAssistantId)
      })
    )
  }

  async getById(id: string): Promise<AppWorkspace | null> {
    const workspace = await this.options.workspaceRecordsRepo.getById(id)
    if (!workspace) {
      return null
    }

    const builtInWorkspaceId =
      await this.options.workspaceRecordsRepo.getBuiltInDefaultWorkspaceId()
    const defaultAssistantId = await this.resolveWorkspaceDefaultAssistantId(
      workspace,
      builtInWorkspaceId
    )
    return toWorkspace(workspace, builtInWorkspaceId, defaultAssistantId)
  }

  async create(input: CreateWorkspaceInput): Promise<AppWorkspace> {
    const builtInWorkspace = await this.ensureBuiltInChatsWorkspace()
    const workspace = await this.options.workspaceRecordsRepo.create(input)
    const defaultAssistant = await this.ensureNamedWorkspaceDefaultAssistant(workspace)
    return toWorkspace(workspace, builtInWorkspace.id, defaultAssistant.id)
  }

  async relocate(id: string, input: RelocateWorkspaceInput): Promise<AppWorkspace | null> {
    const builtInWorkspace = await this.ensureBuiltInChatsWorkspace()
    const existingWorkspace = await this.options.workspaceRecordsRepo.getById(id)
    if (!existingWorkspace) {
      return null
    }

    const workspace = await this.options.workspaceRecordsRepo.update(id, {
      rootPath: input.rootPath
    })

    if (!workspace) {
      return null
    }

    const defaultAssistant = await this.options.assistantsRepo.findWorkspaceDefaultByRootPath(
      existingWorkspace.rootPath
    )
    if (defaultAssistant) {
      await this.options.assistantsRepo.update(defaultAssistant.id, {
        name: toWorkspaceDefaultAssistantName(workspace),
        workspaceConfig: {
          ...defaultAssistant.workspaceConfig,
          rootPath: workspace.rootPath
        },
        mcpConfig: {
          ...defaultAssistant.mcpConfig,
          [WORKSPACE_DEFAULT_AGENT_MCP_KEY]: true
        }
      })
    }

    const nextDefaultAssistantId =
      defaultAssistant?.id ?? (await this.ensureNamedWorkspaceDefaultAssistant(workspace)).id
    return toWorkspace(workspace, builtInWorkspace.id, nextDefaultAssistantId)
  }

  async delete(id: string): Promise<'deleted' | 'built-in' | 'missing'> {
    if (await this.options.workspaceRecordsRepo.isBuiltInDefaultWorkspace(id)) {
      return 'built-in'
    }

    const workspace = await this.options.workspaceRecordsRepo.getById(id)
    if (!workspace) {
      return 'missing'
    }

    await this.options.threadsRepo.deleteByWorkspace(id)
    const workspaceAssistant = await this.options.assistantsRepo.findWorkspaceDefaultByRootPath(
      workspace.rootPath
    )
    if (workspaceAssistant) {
      await this.options.assistantsRepo.delete(workspaceAssistant.id)
    }

    const deleted = await this.options.workspaceRecordsRepo.delete(id)
    return deleted ? 'deleted' : 'missing'
  }
}
