import { Client, type CallToolResult, type Tool } from '@modelcontextprotocol/client'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { AppMcpServer, AppMcpSettings } from '../../persistence/repos/mcp-servers-repo'

type McpClient = Pick<Client, 'callTool' | 'close' | 'listTools'>

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

function describeContent(content: CallToolResult['content']): string {
  const text = content
    .map((block) => {
      if (block.type === 'text') return block.text
      if (block.type === 'image') return `[MCP returned image: ${block.mimeType}]`
      if (block.type === 'audio') return `[MCP returned audio: ${block.mimeType}]`
      if (block.type === 'resource_link') return `[MCP returned resource: ${block.uri}]`
      if (block.type === 'resource')
        return `[MCP returned embedded resource: ${block.resource.uri}]`
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

  const client = new Client({ name: 'tia-studio', version: '0.3.6' })
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
    client,
    close: () => client.close()
  }
}

function makeTool(
  serverId: string,
  tool: Tool,
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
      let result: CallToolResult
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
    ((serverId: string, server: AppMcpServer) =>
      connectStdioServer(serverId, server, options.resolveCommand))
  const connections: McpClientConnection[] = []
  const notices: string[] = []
  const tools: ToolDefinition[] = []
  const usedNames = new Set<string>()

  for (const [serverId, server] of Object.entries(settings.mcpServers)) {
    if (!server.isActive) continue
    if (server.type.trim().toLowerCase() !== 'stdio') {
      options.onStatus?.({ serverId, state: 'unsupported' })
      notices.push(`MCP server ${server.name} was skipped: TIA currently supports stdio transport.`)
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
