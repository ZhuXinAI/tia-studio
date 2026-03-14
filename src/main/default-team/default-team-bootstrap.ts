import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { TeamWorkspacesRepository } from '../persistence/repos/team-workspaces-repo'

const DEFAULT_TEAM_ROOT_DIRECTORY = 'default_root'
const DEFAULT_TEAM_DIRECTORY = 'default_team'

export const DEFAULT_TEAM_NAME = 'Default Team'

type EnsureBuiltInDefaultTeamWorkspaceOptions = {
  teamWorkspacesRepo: TeamWorkspacesRepository
  providersRepo: ProvidersRepository
  userDataPath: string
}

export function resolveDefaultTeamWorkspacePath(userDataPath: string): string {
  return path.join(userDataPath, DEFAULT_TEAM_ROOT_DIRECTORY, DEFAULT_TEAM_DIRECTORY)
}

function pickDefaultSupervisor(
  providers: Array<{
    id: string
    enabled: boolean
    selectedModel: string
  }>
): { providerId: string; model: string } | null {
  for (const provider of providers) {
    if (!provider.enabled) {
      continue
    }

    const selectedModel = provider.selectedModel.trim()
    if (selectedModel.length === 0) {
      continue
    }

    return {
      providerId: provider.id,
      model: selectedModel
    }
  }

  return null
}

export async function ensureBuiltInDefaultTeamWorkspace(
  options: EnsureBuiltInDefaultTeamWorkspaceOptions
): Promise<void> {
  const rootPath = resolveDefaultTeamWorkspacePath(options.userDataPath)
  await mkdir(rootPath, { recursive: true })

  const storedWorkspaceId = await options.teamWorkspacesRepo.getBuiltInDefaultWorkspaceId()
  let workspace = storedWorkspaceId
    ? await options.teamWorkspacesRepo.getById(storedWorkspaceId)
    : await options.teamWorkspacesRepo.findByRootPath(rootPath)

  if (!workspace) {
    workspace = await options.teamWorkspacesRepo.create({
      name: DEFAULT_TEAM_NAME,
      rootPath
    })
  }

  await options.teamWorkspacesRepo.setBuiltInDefaultWorkspaceId(workspace.id)

  const providers = await options.providersRepo.list()
  const defaultSupervisor = pickDefaultSupervisor(providers)
  if (!defaultSupervisor) {
    if (workspace.rootPath !== rootPath) {
      await options.teamWorkspacesRepo.update(workspace.id, {
        rootPath
      })
    }

    return
  }

  if (
    workspace.rootPath === rootPath &&
    workspace.supervisorProviderId &&
    workspace.supervisorProviderId.trim().length > 0 &&
    workspace.supervisorModel.trim().length > 0
  ) {
    return
  }

  await options.teamWorkspacesRepo.update(workspace.id, {
    rootPath,
    supervisorProviderId:
      workspace.supervisorProviderId && workspace.supervisorProviderId.trim().length > 0
        ? workspace.supervisorProviderId
        : defaultSupervisor.providerId,
    supervisorModel:
      workspace.supervisorModel.trim().length > 0
        ? workspace.supervisorModel
        : defaultSupervisor.model
  })
}
