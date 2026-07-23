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

export type McpServerAuthStatus = 'signed-in' | 'sign-in-incomplete' | 'not-signed-in'

export type McpServersAuth = Record<string, McpServerAuthStatus>

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

export async function getMcpServersAuth(): Promise<McpServersAuth> {
  const result = await apiClient.get<{ auth: McpServersAuth }>('/v1/settings/mcp-servers/auth')
  return result.auth
}

export async function loginToMcpServer(serverId: string): Promise<McpServerAuthStatus> {
  const result = await apiClient.post<{ auth: McpServerAuthStatus }>(
    `/v1/settings/mcp-servers/${encodeURIComponent(serverId)}/auth/login`
  )
  return result.auth
}

export async function logoutFromMcpServer(serverId: string): Promise<McpServerAuthStatus> {
  const result = await apiClient.delete<{ auth: McpServerAuthStatus }>(
    `/v1/settings/mcp-servers/${encodeURIComponent(serverId)}/auth`
  )
  return result.auth
}
