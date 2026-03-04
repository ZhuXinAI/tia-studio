import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'

const DEFAULT_AGENT_DIRECTORY = 'default-agent'
const DEFAULT_AGENT_SKILLS_DIRECTORY = 'skills'
export const BUILT_IN_DEFAULT_AGENT_MCP_KEY = '__tiaBuiltInDefaultAgent'

export const DEFAULT_AGENT_NAME = 'Default Agent'
export const DEFAULT_AGENT_PROMPT =
  'You are Tia\'s built-in default agent. Use workspace tools, available global skills, and workspace skills to help with local development tasks.'

type EnsureBuiltInDefaultAgentOptions = {
  assistantsRepo: AssistantsRepository
  providersRepo: ProvidersRepository
  userDataPath: string
}

export function resolveDefaultAgentWorkspacePath(userDataPath: string): string {
  return path.join(userDataPath, DEFAULT_AGENT_DIRECTORY)
}

function readWorkspaceRootPath(workspaceConfig: Record<string, unknown> | null | undefined): string | null {
  if (!workspaceConfig) {
    return null
  }

  const rootPath = workspaceConfig.rootPath
  if (typeof rootPath !== 'string') {
    return null
  }

  const normalizedRootPath = rootPath.trim()
  return normalizedRootPath.length > 0 ? path.resolve(normalizedRootPath) : null
}

async function protectBuiltInDefaultAgent(
  options: EnsureBuiltInDefaultAgentOptions,
  assistants: Array<{
    id: string
    workspaceConfig: Record<string, unknown>
    mcpConfig: Record<string, boolean>
  }>,
  defaultWorkspacePath: string
): Promise<void> {
  const normalizedDefaultWorkspacePath = path.resolve(defaultWorkspacePath)
  const builtInAssistant = assistants.find((assistant) => {
    const assistantWorkspacePath = readWorkspaceRootPath(assistant.workspaceConfig)
    return assistantWorkspacePath === normalizedDefaultWorkspacePath
  })
  if (!builtInAssistant) {
    return
  }

  if (builtInAssistant.mcpConfig[BUILT_IN_DEFAULT_AGENT_MCP_KEY] === true) {
    return
  }

  await options.assistantsRepo.update(builtInAssistant.id, {
    mcpConfig: {
      ...builtInAssistant.mcpConfig,
      [BUILT_IN_DEFAULT_AGENT_MCP_KEY]: true
    }
  })
}

function pickDefaultProviderId(
  providers: Array<{
    id: string
    enabled: boolean
    selectedModel: string
  }>
): string {
  for (const provider of providers) {
    if (!provider.enabled) {
      continue
    }

    if (provider.selectedModel.trim().length === 0) {
      continue
    }

    return provider.id
  }

  return ''
}

export async function ensureBuiltInDefaultAgent(
  options: EnsureBuiltInDefaultAgentOptions
): Promise<void> {
  const workspacePath = resolveDefaultAgentWorkspacePath(options.userDataPath)
  await mkdir(workspacePath, { recursive: true })
  await mkdir(path.join(workspacePath, DEFAULT_AGENT_SKILLS_DIRECTORY), { recursive: true })

  const assistants = await options.assistantsRepo.list()
  await protectBuiltInDefaultAgent(options, assistants, workspacePath)
  if (assistants.length > 0) {
    return
  }

  const providers = await options.providersRepo.list()

  await options.assistantsRepo.create({
    name: DEFAULT_AGENT_NAME,
    instructions: DEFAULT_AGENT_PROMPT,
    providerId: pickDefaultProviderId(providers),
    workspaceConfig: {
      rootPath: workspacePath
    },
    skillsConfig: {},
    mcpConfig: {
      [BUILT_IN_DEFAULT_AGENT_MCP_KEY]: true
    },
    maxSteps: 100
  })
}
