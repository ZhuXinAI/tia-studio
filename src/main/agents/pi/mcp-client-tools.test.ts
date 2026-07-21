import { describe, expect, it, vi } from 'vitest'
import { createMcpClientTools } from './mcp-client-tools'

describe('createMcpClientTools', () => {
  it('maps discovered MCP tools to Pi tools, calls them, and closes the client', async () => {
    const callTool = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'Tokyo: 29°C' }],
      isError: false
    }))
    const close = vi.fn(async () => {})
    const onStatus = vi.fn()
    const connect = vi.fn(async () => ({
      client: {
        listTools: async () => ({
          tools: [
            {
              name: 'get-weather',
              description: 'Get the weather for a city',
              inputSchema: {
                type: 'object' as const,
                properties: { city: { type: 'string' } },
                required: ['city']
              }
            }
          ]
        }),
        callTool,
        close
      },
      close
    }))

    const mcp = await createMcpClientTools(
      {
        mcpServers: {
          weather: {
            isActive: true,
            name: 'Weather',
            type: 'stdio',
            command: 'node',
            args: ['server.mjs'],
            env: {},
            installSource: 'manual'
          }
        }
      },
      { connect, onStatus }
    )

    expect(mcp.notices).toEqual([])
    expect(mcp.tools).toHaveLength(1)
    expect(mcp.tools[0]?.name).toBe('mcp_weather_get_weather')
    expect(onStatus).toHaveBeenCalledWith({ serverId: 'weather', state: 'connected', toolCount: 1 })

    const result = await mcp.tools[0]!.execute(
      'tool-call',
      { city: 'Tokyo' } as never,
      undefined,
      undefined,
      {} as never
    )
    expect(callTool).toHaveBeenCalledWith({ name: 'get-weather', arguments: { city: 'Tokyo' } })
    expect(result.content).toEqual([{ type: 'text', text: 'Tokyo: 29°C' }])
    expect(onStatus).toHaveBeenLastCalledWith({ serverId: 'weather', state: 'connected' })

    await mcp.close()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('keeps the session usable when a server is unsupported or tool discovery fails', async () => {
    const close = vi.fn(async () => {})
    const onStatus = vi.fn()
    const connect = vi.fn(async () => ({
      client: {
        listTools: async () => {
          throw new Error('tools/list failed')
        },
        callTool: vi.fn(),
        close
      },
      close
    }))

    const mcp = await createMcpClientTools(
      {
        mcpServers: {
          remote: {
            isActive: true,
            name: 'Remote',
            type: 'streamable-http',
            args: [],
            env: {},
            installSource: 'manual',
            url: 'https://example.com/mcp'
          },
          broken: {
            isActive: true,
            name: 'Broken',
            type: 'stdio',
            command: 'node',
            args: ['server.mjs'],
            env: {},
            installSource: 'manual'
          }
        }
      },
      { connect, onStatus }
    )

    expect(mcp.tools).toEqual([])
    expect(mcp.notices).toEqual([
      'MCP server Remote was skipped: TIA currently supports stdio transport.',
      'MCP server Broken was unavailable: tools/list failed'
    ])
    expect(close).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith({ serverId: 'remote', state: 'unsupported' })
    expect(onStatus).toHaveBeenCalledWith({ serverId: 'broken', state: 'error' })
  })
})
