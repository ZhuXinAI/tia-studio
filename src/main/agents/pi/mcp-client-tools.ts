import { createMCPClient } from '@ai-sdk/mcp'
import { Client } from '@modelcontextprotocol/client'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { McpAuthRepository } from '../../persistence/repos/mcp-auth-repo'
import type { AppMcpServer, AppMcpSettings } from '../../persistence/repos/mcp-servers-repo'
import {
  createMcpOAuthProvider,
  MCP_OAUTH_REAUTH_REDIRECT_URL,
  remoteMcpTransport
} from '../../mcp/mcp-oauth'

type McpTool = {
  name: string
  title?: string
  description?: string
  inputSchema: unknown
}

type McpToolResult = {
  content: Array<{
    type: string
    text?: string
    mimeType?: string
    uri?: string
    resource?: { uri?: string }
  }>
  isError?: boolean
}

type McpClient = {
  callTool: (input: { name: string; arguments: Record<string, unknown> }) => Promise<McpToolResult>
  close: () => Promise<void>
  listTools: () => Promise<{ tools: McpTool[] }>
}

export type McpClientConnection = {
  client: McpClient
  close: () => Promise<void>
}

export type McpClientToolsOptions = {
  connect?: (serverId: string, server: AppMcpServer) => Promise<McpClientConnection>
  resolveCommand?: (
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv
  ) => Promise<{ command: string; args: string[]; env: NodeJS.ProcessEnv }>
  mcpAuthRepository?: McpAuthRepository
  onStatus?: (update: McpClientStatusUpdate) => void
}

export type McpClientStatusUpdate = {
  serverId: string
  state: 'connected' | 'error' | 'unsupported'
  toolCount?: number
}

export type McpClientTools = {
  notices: string[]
  tools: ToolDefinition[]
  close: () => Promise<void>
}

function toolNameSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'tool'
}

function nextToolName(serverId: string, toolName: string, usedNames: Set<string>): string {
  const base = `mcp_${toolNameSegment(serverId)}_${toolNameSegment(toolName)}`.slice(0, 80)
  let candidate = base
  let suffix = 2
  while (usedNames.has(candidate)) {
    const suffixText = `_${suffix++}`
    candidate = `${base.slice(0, 80 - suffixText.length)}${suffixText}`
  }
  usedNames.add(candidate)
  return candidate
}

function describeContent(content: McpToolResult['content']): string {
  const text = content
    .map((block) => {
      if (block.type === 'text' && typeof block.text === 'string') return block.text
      if (block.type === 'image' && typeof block.mimeType === 'string') {
        return `[MCP returned image: ${block.mimeType}]`
      }
      if (block.type === 'audio' && typeof block.mimeType === 'string') {
        return `[MCP returned audio: ${block.mimeType}]`
      }
      if (block.type === 'resource_link' && typeof block.uri === 'string') {
        return `[MCP returned resource: ${block.uri}]`
      }
      if (block.type === 'resource' && block.resource?.uri) {
        return `[MCP returned embedded resource: ${block.resource.uri}]`
      }
      return '[MCP returned content]'
    })
    .filter((value) => value.trim().length > 0)
    .join('\n')

  return text || '[MCP tool returned no content]'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function connectStdioServer(
  _serverId: string,
  server: AppMcpServer,
  resolveCommand?: McpClientToolsOptions['resolveCommand']
): Promise<McpClientConnection> {
  if (!server.command) throw new Error('missing command')

  const initialEnv = { ...getDefaultEnvironment(), ...server.env }
  const resolved = resolveCommand
    ? await resolveCommand(server.command, server.args, initialEnv)
    : { command: server.command, args: server.args, env: initialEnv }

  const client = new Client({ name: 'tia-studio', version: '0.3.8' })
  const transport = new StdioClientTransport({
    command: resolved.command,
    args: resolved.args,
    env: Object.fromEntries(
      Object.entries(resolved.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  })

  try {
    await client.connect(transport)
  } catch (error) {
    await transport.close().catch(() => {})
    throw error
  }

  return {
    client: client as unknown as McpClient,
    close: () => client.close()
  }
}

async function connectRemoteServer(
  serverId: string,
  server: AppMcpServer,
  authRepository: McpAuthRepository | undefined
): Promise<McpClientConnection> {
  const transportType = remoteMcpTransport(server)
  if (!transportType || !server.url) {
    throw new Error('a valid HTTP or SSE MCP URL is required')
  }

  const serverUrl = new URL(server.url).href
  const savedAuthState = authRepository ? await authRepository.getState(serverId) : undefined
  const authState = savedAuthState?.serverUrl === serverUrl ? savedAuthState : undefined
  try {
    const client = await createMCPClient({
      clientName: 'tia-studio',
      transport: {
        type: transportType,
        url: server.url,
        ...(authState && authRepository
          ? {
              authProvider: createMcpOAuthProvider({
                serverId,
                redirectUrl: authState.redirectUrl ?? MCP_OAUTH_REAUTH_REDIRECT_URL,
                authRepository,
                onAuthorizationUrl: async () => {
                  throw new Error(
                    `MCP server ${server.name} needs sign-in. Open Settings > MCP Servers and select Sign in.`
                  )
                }
              })
            }
          : {})
      }
    })
    return {
      client: client as unknown as McpClient,
      close: () => client.close()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'connection failed'
    if (!authState && /\b401\b|unauthoriz/i.test(message)) {
      throw new Error(
        `MCP server ${server.name} requires sign-in. Open Settings > MCP Servers and select Sign in.`
      )
    }
    throw error
  }
}

async function connectServer(
  serverId: string,
  server: AppMcpServer,
  options: McpClientToolsOptions
): Promise<McpClientConnection> {
  if (server.type.trim().toLowerCase() === 'stdio') {
    return connectStdioServer(serverId, server, options.resolveCommand)
  }
  return connectRemoteServer(serverId, server, options.mcpAuthRepository)
}

function makeTool(
  serverId: string,
  tool: McpTool,
  client: McpClient,
  usedNames: Set<string>,
  onStatus?: McpClientToolsOptions['onStatus']
): ToolDefinition {
  const name = nextToolName(serverId, tool.name, usedNames)
  return {
    name,
    label: `${serverId}: ${tool.title ?? tool.name}`,
    description: `MCP server ${serverId}, tool ${tool.name}. ${tool.description ?? ''}`.trim(),
    promptSnippet: `${serverId}: ${tool.description ?? tool.name}`,
    parameters: tool.inputSchema as ToolDefinition['parameters'],
    execute: async (_toolCallId, params) => {
      let result: McpToolResult
      try {
        result = await client.callTool({
          name: tool.name,
          arguments: asRecord(params)
        })
      } catch (error) {
        onStatus?.({ serverId, state: 'error' })
        throw error
      }
      const summary = describeContent(result.content)
      onStatus?.({ serverId, state: result.isError ? 'error' : 'connected' })
      return {
        content: [
          {
            type: 'text',
            text: result.isError ? `MCP tool error:\n${summary}` : summary
          }
        ],
        details: {
          serverId,
          toolName: tool.name,
          isError: result.isError === true
        }
      }
    }
  }
}

export async function createMcpClientTools(
  settings: AppMcpSettings,
  options: McpClientToolsOptions = {}
): Promise<McpClientTools> {
  const connect =
    options.connect ??
    ((serverId: string, server: AppMcpServer) => connectServer(serverId, server, options))
  const connections: McpClientConnection[] = []
  const notices: string[] = []
  const tools: ToolDefinition[] = []
  const usedNames = new Set<string>()

  for (const [serverId, server] of Object.entries(settings.mcpServers)) {
    if (!server.isActive) continue
    const transportType = server.type.trim().toLowerCase()
    if (transportType !== 'stdio' && transportType !== 'http' && transportType !== 'sse') {
      options.onStatus?.({ serverId, state: 'unsupported' })
      notices.push(
        `MCP server ${server.name} was skipped: TIA supports stdio, HTTP, and SSE transports.`
      )
      continue
    }

    let connection: McpClientConnection | undefined
    try {
      connection = await connect(serverId, server)
      const activeConnection = connection
      const listed = await activeConnection.client.listTools()
      connections.push(activeConnection)
      options.onStatus?.({ serverId, state: 'connected', toolCount: listed.tools.length })
      tools.push(
        ...listed.tools.map((tool) =>
          makeTool(serverId, tool, activeConnection.client, usedNames, options.onStatus)
        )
      )
    } catch (error) {
      await connection?.close().catch(() => {})
      options.onStatus?.({ serverId, state: 'error' })
      notices.push(
        `MCP server ${server.name} was unavailable: ${error instanceof Error ? error.message : 'connection failed'}`
      )
    }
  }

  return {
    tools,
    notices,
    close: async () => {
      await Promise.allSettled(connections.map((connection) => connection.close()))
    }
  }
}
