import {
  createAssistant,
  updateAssistant,
  type AssistantRecord
} from './assistants-query'
import { resolveDefaultAssistantWorkspacePath } from './default-workspace-path-query'
import {
  createProvider,
  updateProvider,
  type ProviderRecord
} from '../settings/providers/providers-query'
import type { InstalledLocalAcpAgentRecord } from '../threads/local-acp-agents-query'

export const AUTO_LOCAL_ACP_AGENT_KEY = '__tiaAutoLocalAcpAgentKey'
export const AUTO_LOCAL_ACP_AGENT_COMMAND = '__tiaAutoLocalAcpAgentCommand'

export function encodeLocalAcpApiHost(command: string): string {
  return `acp://${encodeURIComponent(command.trim())}`
}

export function readAutoLocalAcpAgentKey(
  workspaceConfig: Record<string, unknown> | null | undefined
): string | null {
  const value = workspaceConfig?.[AUTO_LOCAL_ACP_AGENT_KEY]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function readAutoLocalAcpAgentCommand(
  workspaceConfig: Record<string, unknown> | null | undefined
): string | null {
  const value = workspaceConfig?.[AUTO_LOCAL_ACP_AGENT_COMMAND]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function readAssistantWorkspaceRootPath(
  workspaceConfig: Record<string, unknown> | null | undefined
): string | null {
  const value = workspaceConfig?.rootPath
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

type SyncInstalledLocalAcpAgentsInput = {
  installedAgents: InstalledLocalAcpAgentRecord[]
  providers: ProviderRecord[]
  assistants: AssistantRecord[]
}

type SyncInstalledLocalAcpAgentsResult = {
  providers: ProviderRecord[]
  assistants: AssistantRecord[]
  didMutate: boolean
}

export async function syncInstalledLocalAcpAgents(
  input: SyncInstalledLocalAcpAgentsInput
): Promise<SyncInstalledLocalAcpAgentsResult> {
  let nextProviders = [...input.providers]
  let nextAssistants = [...input.assistants]
  let didMutate = false

  for (const installedAgent of input.installedAgents) {
    const targetApiHost = encodeLocalAcpApiHost(installedAgent.resolvedCommand)
    let provider =
      nextProviders.find(
        (candidate) => candidate.type === 'acp' && candidate.apiHost === targetApiHost
      ) ?? null

    if (!provider) {
      provider = await createProvider({
        name: installedAgent.label,
        type: 'acp',
        apiKey: '',
        apiHost: targetApiHost,
        selectedModel: 'default',
        supportsVision: true,
        enabled: true
      })
      nextProviders = [provider, ...nextProviders]
      didMutate = true
    } else if (!provider.enabled) {
      provider = await updateProvider(provider.id, {
        enabled: true
      })
      const enabledProvider = provider
      nextProviders = nextProviders.map((candidate) =>
        candidate.id === enabledProvider.id ? enabledProvider : candidate
      )
      didMutate = true
    }

    if (!provider) {
      continue
    }

    const existingAssistant =
      nextAssistants.find(
        (assistant) => readAutoLocalAcpAgentKey(assistant.workspaceConfig) === installedAgent.key
      ) ?? null
    const currentWorkspaceRootPath = readAssistantWorkspaceRootPath(existingAssistant?.workspaceConfig)
    const workspaceRootPath =
      currentWorkspaceRootPath ?? (await resolveDefaultAssistantWorkspacePath(installedAgent.label))

    if (!existingAssistant) {
      const createdAssistant = await createAssistant({
        name: installedAgent.label,
        description: `${installedAgent.label} detected from your local ACP tools.`,
        providerId: provider.id,
        enabled: true,
        origin: 'external-acp',
        studioFeaturesEnabled: false,
        workspaceConfig: {
          rootPath: workspaceRootPath,
          [AUTO_LOCAL_ACP_AGENT_KEY]: installedAgent.key,
          [AUTO_LOCAL_ACP_AGENT_COMMAND]: installedAgent.resolvedCommand
        }
      })
      nextAssistants = [createdAssistant, ...nextAssistants]
      didMutate = true
      continue
    }

    const existingCommand = readAutoLocalAcpAgentCommand(existingAssistant.workspaceConfig)
    const needsAssistantUpdate =
      existingAssistant.providerId !== provider.id ||
      currentWorkspaceRootPath !== workspaceRootPath ||
      existingCommand !== installedAgent.resolvedCommand

    if (!needsAssistantUpdate) {
      continue
    }

    const updatedAssistant = await updateAssistant(existingAssistant.id, {
      providerId: provider.id,
      workspaceConfig: {
        ...existingAssistant.workspaceConfig,
        rootPath: workspaceRootPath,
        [AUTO_LOCAL_ACP_AGENT_KEY]: installedAgent.key,
        [AUTO_LOCAL_ACP_AGENT_COMMAND]: installedAgent.resolvedCommand
      }
    })
    nextAssistants = nextAssistants.map((assistant) =>
      assistant.id === updatedAssistant.id ? updatedAssistant : assistant
    )
    didMutate = true
  }

  return {
    providers: nextProviders,
    assistants: nextAssistants,
    didMutate
  }
}
