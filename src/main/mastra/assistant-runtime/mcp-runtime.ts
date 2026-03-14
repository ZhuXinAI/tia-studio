import type { MastraMCPServerDefinition } from '@mastra/mcp'
import type {
  ManagedRuntimeKind,
  ManagedRuntimeRecord,
  ManagedRuntimesState
} from '../../persistence/repos/managed-runtimes-repo'
import type { AppMcpServer } from '../../persistence/repos/mcp-servers-repo'
import { ChatRouteError } from '../../server/chat/chat-errors'

export type ManagedRuntimeResolverLike = {
  getStatus: () => Promise<ManagedRuntimesState>
  resolveManagedCommand: (
    command: string,
    args: string[],
    env?: NodeJS.ProcessEnv
  ) => Promise<{
    command: string
    args: string[]
    env: NodeJS.ProcessEnv
  }>
}

export async function toMcpServerDefinitions(input: {
  servers: Record<string, AppMcpServer>
  managedRuntimeResolver?: ManagedRuntimeResolverLike
}): Promise<Record<string, MastraMCPServerDefinition>> {
  const entries = (
    await Promise.all(
      Object.entries(input.servers).map(async ([serverName, server]) => {
        const definition = await toMcpServerDefinition({
          server,
          managedRuntimeResolver: input.managedRuntimeResolver
        })
        if (!definition) {
          return null
        }

        return [serverName, definition] as const
      })
    )
  ).filter((entry): entry is readonly [string, MastraMCPServerDefinition] => entry !== null)

  return Object.fromEntries(entries)
}

export async function toMcpServerDefinition(input: {
  server: AppMcpServer
  managedRuntimeResolver?: ManagedRuntimeResolverLike
}): Promise<MastraMCPServerDefinition | null> {
  const command = toNonEmptyString(input.server.command)
  const url = toNonEmptyString(input.server.url)
  const serverType = input.server.type.trim().toLowerCase()

  if (serverType === 'stdio') {
    if (!command) {
      return null
    }

    return toCommandMcpServerDefinition({
      command,
      args: input.server.args,
      env: input.server.env,
      managedRuntimeResolver: input.managedRuntimeResolver
    })
  }

  if (url) {
    try {
      return {
        url: new URL(url)
      }
    } catch {
      // Ignore invalid URLs in MCP server definitions.
    }
  }

  if (command) {
    return toCommandMcpServerDefinition({
      command,
      args: input.server.args,
      env: input.server.env,
      managedRuntimeResolver: input.managedRuntimeResolver
    })
  }

  return null
}

export async function toCommandMcpServerDefinition(input: {
  command: string
  args: string[]
  env: Record<string, string>
  managedRuntimeResolver?: ManagedRuntimeResolverLike
}): Promise<MastraMCPServerDefinition> {
  const resolved = await resolveManagedCommand({
    command: input.command,
    args: input.args,
    env: input.env,
    managedRuntimeResolver: input.managedRuntimeResolver
  })
  const normalizedEnv = toStringMap(resolved.env)

  return {
    command: resolved.command,
    ...(resolved.args.length > 0 ? { args: resolved.args } : {}),
    ...(Object.keys(normalizedEnv).length > 0 ? { env: normalizedEnv } : {})
  }
}

export async function resolveManagedCommand(input: {
  command: string
  args: string[]
  env: Record<string, string>
  managedRuntimeResolver?: ManagedRuntimeResolverLike
}): Promise<{
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
}> {
  if (!input.managedRuntimeResolver) {
    return {
      command: input.command,
      args: input.args,
      env: input.env
    }
  }

  const requiredRuntime = getRequiredManagedRuntimeKind(input.command)
  if (requiredRuntime) {
    const status = await input.managedRuntimeResolver.getStatus()
    if (!isManagedRuntimeReady(status[requiredRuntime])) {
      throw new ChatRouteError(
        409,
        'managed_runtime_missing',
        `This MCP server uses ${input.command}, which requires the ${requiredRuntime} managed runtime. Open Runtime Setup to install or select ${requiredRuntime}.`
      )
    }
  }

  return input.managedRuntimeResolver.resolveManagedCommand(input.command, input.args, input.env)
}

export function getRequiredManagedRuntimeKind(command: string): ManagedRuntimeKind | null {
  const normalized = command.trim().toLowerCase()

  if (normalized === 'npx' || normalized === 'bun' || normalized === 'bunx') {
    return 'bun'
  }

  if (normalized === 'uv' || normalized === 'uvx') {
    return 'uv'
  }

  return null
}

export function isManagedRuntimeReady(record: ManagedRuntimeRecord | undefined): boolean {
  if (!record) {
    return false
  }

  return (
    Boolean(record.binaryPath) &&
    (record.status === 'ready' ||
      record.status === 'custom-ready' ||
      record.status === 'update-available')
  )
}

export function toStringMap(value: NodeJS.ProcessEnv): Record<string, string> {
  const entries = Object.entries(value)
    .map(([key, rawValue]) => {
      const normalizedKey = key.trim()
      if (normalizedKey.length === 0 || typeof rawValue !== 'string') {
        return null
      }

      return [normalizedKey, rawValue] as const
    })
    .filter((entry): entry is readonly [string, string] => entry !== null)

  return Object.fromEntries(entries)
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}
