import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type AppMcpServer = {
  isActive: boolean
  name: string
  type: string
  command?: string
  args: string[]
  env: Record<string, string>
  installSource: string
  url?: string
}

export type AppMcpSettings = {
  mcpServers: Record<string, AppMcpServer>
}

const defaultMcpSettings: AppMcpSettings = {
  mcpServers: {}
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function toStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const entries = Object.entries(value)
    .map(([key, itemValue]) => {
      const normalizedKey = key.trim()
      if (normalizedKey.length === 0) {
        return null
      }

      if (typeof itemValue === 'string') {
        return [normalizedKey, itemValue] as const
      }

      if (typeof itemValue === 'number' || typeof itemValue === 'boolean') {
        return [normalizedKey, String(itemValue)] as const
      }

      return null
    })
    .filter((entry): entry is readonly [string, string] => entry !== null)

  return Object.fromEntries(entries)
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') {
      return true
    }

    if (normalized === 'false' || normalized === '0') {
      return false
    }
  }

  return fallback
}

function normalizeServer(serverId: string, rawValue: unknown): AppMcpServer {
  const candidate =
    rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {}

  const type = toNonEmptyString((candidate as { type?: unknown }).type) ?? 'stdio'

  return {
    isActive: toBoolean((candidate as { isActive?: unknown }).isActive, true),
    name: toNonEmptyString((candidate as { name?: unknown }).name) ?? serverId,
    type,
    ...(toNonEmptyString((candidate as { command?: unknown }).command)
      ? { command: toNonEmptyString((candidate as { command?: unknown }).command) }
      : {}),
    args: toStringList((candidate as { args?: unknown }).args),
    env: toStringMap((candidate as { env?: unknown }).env),
    installSource:
      toNonEmptyString((candidate as { installSource?: unknown }).installSource) ?? 'unknown',
    ...(toNonEmptyString((candidate as { url?: unknown }).url)
      ? { url: toNonEmptyString((candidate as { url?: unknown }).url) }
      : {})
  }
}

function normalizeSettings(value: unknown): AppMcpSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ...defaultMcpSettings
    }
  }

  const rawServers =
    (value as { mcpServers?: unknown }).mcpServers &&
    typeof (value as { mcpServers?: unknown }).mcpServers === 'object' &&
    !Array.isArray((value as { mcpServers?: unknown }).mcpServers)
      ? ((value as { mcpServers?: unknown }).mcpServers as Record<string, unknown>)
      : {}

  const entries = Object.entries(rawServers)
    .map(([serverId, serverConfig]) => {
      const normalizedServerId = serverId.trim()
      if (normalizedServerId.length === 0) {
        return null
      }

      return [normalizedServerId, normalizeServer(normalizedServerId, serverConfig)] as const
    })
    .filter((entry): entry is readonly [string, AppMcpServer] => entry !== null)

  return {
    mcpServers: Object.fromEntries(entries)
  }
}

export class McpServersRepository {
  constructor(private readonly filePath: string) {}

  async getSettings(): Promise<AppMcpSettings> {
    const rawContent = await this.readFileContent()

    if (!rawContent) {
      await this.saveSettings(defaultMcpSettings)
      return {
        ...defaultMcpSettings
      }
    }

    try {
      const parsed = JSON.parse(rawContent) as unknown
      return normalizeSettings(parsed)
    } catch {
      throw new Error('Invalid mcp.json format')
    }
  }

  async saveSettings(input: AppMcpSettings): Promise<AppMcpSettings> {
    const normalized = normalizeSettings(input)
    await this.ensureParentDirectory()
    await writeFile(this.filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
    return normalized
  }

  private async readFileContent(): Promise<string | null> {
    try {
      return await readFile(this.filePath, 'utf-8')
    } catch (error) {
      if (this.isFileMissingError(error)) {
        return null
      }

      throw error
    }
  }

  private async ensureParentDirectory(): Promise<void> {
    const directory = path.dirname(this.filePath)
    await mkdir(directory, { recursive: true })
  }

  private isFileMissingError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    return (error as { code?: unknown }).code === 'ENOENT'
  }
}
