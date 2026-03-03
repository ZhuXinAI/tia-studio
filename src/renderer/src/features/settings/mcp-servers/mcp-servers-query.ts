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

const apiClient = createApiClient()

export async function getMcpServersSettings(): Promise<McpServersSettings> {
  return apiClient.get<McpServersSettings>('/v1/settings/mcp-servers')
}

export async function updateMcpServersSettings(
  input: McpServersSettings
): Promise<McpServersSettings> {
  return apiClient.put<McpServersSettings>('/v1/settings/mcp-servers', input)
}
