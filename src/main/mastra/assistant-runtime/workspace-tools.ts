import os from 'node:os'
import path from 'node:path'
import type { MemoryConfig } from '@mastra/core/memory'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import type { AppMcpServer, McpServersRepository } from '../../persistence/repos/mcp-servers-repo'
import { ChatRouteError } from '../../server/chat/chat-errors'
import { ensureAssistantWorkspaceFiles } from '../assistant-workspace'
import { createContainedLocalFilesystemInstructions } from '../workspace-filesystem-instructions'

export type JsonObject = Record<string, unknown>

export async function buildWorkspace(input: {
  workspaceConfig: JsonObject
  skillsConfig: JsonObject
}): Promise<Workspace | undefined> {
  const rootPath = resolveWorkspaceRootPath(input.workspaceConfig)
  if (!rootPath) {
    return undefined
  }

  await ensureAssistantWorkspaceFiles(rootPath)

  const skillsPaths = resolveSkillsPaths(rootPath, input.skillsConfig)
  const filesystem = new LocalFilesystem({
    basePath: rootPath,
    instructions: createContainedLocalFilesystemInstructions(rootPath)
  })
  const sandbox = new LocalSandbox({
    workingDirectory: rootPath
  })
  const workspace = new Workspace({
    filesystem,
    sandbox,
    ...(skillsPaths.length > 0 ? { skills: skillsPaths } : {})
  })

  await workspace.init()
  return workspace
}

export function resolveWorkspaceRootPath(workspaceConfig: JsonObject): string | null {
  const rootPath = toNonEmptyString(workspaceConfig.rootPath)
  return rootPath ? path.resolve(rootPath) : null
}

export function resolveSkillsPaths(workspaceRootPath: string, skillsConfig: JsonObject): string[] {
  const rawPaths = [
    path.join(os.homedir(), '.claude', 'skills'),
    path.join(os.homedir(), '.agent', 'skills'),
    path.join(workspaceRootPath, 'skills'),
    ...toStringList(skillsConfig.path),
    ...toStringList(skillsConfig.paths),
    ...toStringList(skillsConfig.skillPath),
    ...toStringList(skillsConfig.skillPaths),
    ...toStringList(skillsConfig.skills),
    ...toStringList(skillsConfig.directories)
  ]

  const uniquePaths = new Set<string>()
  for (const rawPath of rawPaths) {
    uniquePaths.add(rawPath)
  }

  return [...uniquePaths]
}

export async function resolveEnabledMcpServers(input: {
  mcpConfig: JsonObject
  mcpServersRepo: Pick<McpServersRepository, 'getSettings'>
}): Promise<Record<string, AppMcpServer>> {
  let settings: Awaited<ReturnType<McpServersRepository['getSettings']>>
  try {
    settings = await input.mcpServersRepo.getSettings()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read MCP settings'
    throw new ChatRouteError(409, 'mcp_settings_invalid', message)
  }

  const assistantEnabledServers = toBooleanMap(input.mcpConfig)

  const entries = Object.entries(settings.mcpServers)
    .filter(
      ([serverName, server]) => server.isActive && assistantEnabledServers[serverName] === true
    )
    .sort(([left], [right]) => left.localeCompare(right))

  return Object.fromEntries(entries)
}

export function resolveMemoryOptions(memoryConfig: JsonObject | null): MemoryConfig {
  const memoryConfigObject = memoryConfig ?? {}
  const explicitOptions = toJsonObject(memoryConfigObject.options)
  const baseOptions =
    Object.keys(explicitOptions).length > 0 ? explicitOptions : memoryConfigObject

  return {
    ...(baseOptions as MemoryConfig),
    generateTitle: true
  }
}

export function toStringList(value: unknown): string[] {
  if (typeof value === 'string') {
    return toNonEmptyString(value) ? [value.trim()] : []
  }

  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function toBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const entries = Object.entries(value)
    .map(([key, itemValue]) => {
      const normalizedKey = key.trim()
      if (normalizedKey.length === 0) {
        return null
      }

      if (typeof itemValue === 'boolean') {
        return [normalizedKey, itemValue] as const
      }

      if (typeof itemValue === 'string') {
        const normalizedValue = itemValue.trim().toLowerCase()
        if (normalizedValue === 'true' || normalizedValue === '1') {
          return [normalizedKey, true] as const
        }

        if (normalizedValue === 'false' || normalizedValue === '0') {
          return [normalizedKey, false] as const
        }
      }

      if (typeof itemValue === 'number') {
        return [normalizedKey, itemValue !== 0] as const
      }

      return null
    })
    .filter((entry): entry is readonly [string, boolean] => entry !== null)

  return Object.fromEntries(entries)
}

export function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

export function toJsonObject(value: unknown): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject
  }

  return {}
}
