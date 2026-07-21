import { createApiClient } from '../../../lib/api-client'

export type McpServerRecord = {
  isActive: boolean
  name: string
  type: string
  command?: string
  args: string[]
  env: Record<string, string>
  installSource: string
  url?: string
}

export type McpServersSettings = {
  mcpServers: Record<string, McpServerRecord>
}

export type McpServerHealth = {
  state: 'connected' | 'error' | 'unsupported'
  updatedAt: string
  toolCount?: number
}

const apiClient = createApiClient()

export async function getMcpServersSettings(): Promise<McpServersSettings> {
  return apiClient.get<McpServersSettings>('/v1/settings/mcp-servers')
}

export async function updateMcpServersSettings(
  input: McpServersSettings
): Promise<McpServersSettings> {
  return apiClient.put<McpServersSettings>('/v1/settings/mcp-servers', input)
}

export async function getMcpServersHealth(): Promise<Record<string, McpServerHealth>> {
  const result = await apiClient.get<{ serverHealth: Record<string, McpServerHealth> }>(
    '/v1/settings/mcp-servers/health'
  )
  return result.serverHealth
}
