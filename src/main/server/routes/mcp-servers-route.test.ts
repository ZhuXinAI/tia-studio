import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerMcpServersRoute } from './mcp-servers-route'
import { McpServerHealthRegistry } from '../../agents/pi/mcp-server-health'

describe('mcp servers settings route', () => {
  it('returns current mcp settings', async () => {
    const getSettings = vi.fn(async () => ({
      mcpServers: {
        'amap-maps': {
          isActive: true,
          name: 'amap-maps',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@amap/amap-maps-mcp-server'],
          env: {
            AMAP_MAPS_API_KEY: 'test-key'
          },
          installSource: 'unknown'
        }
      }
    }))
    const saveSettings = vi.fn(async () => ({ mcpServers: {} }))
    const app = new Hono()

    registerMcpServersRoute(app, {
      mcpServersRepo: {
        getSettings,
        saveSettings
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/mcp-servers')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      mcpServers: {
        'amap-maps': {
          isActive: true,
          name: 'amap-maps',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@amap/amap-maps-mcp-server'],
          env: {
            AMAP_MAPS_API_KEY: 'test-key'
          },
          installSource: 'unknown'
        }
      }
    })
    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('updates mcp settings with validated payload', async () => {
    const payload = {
      mcpServers: {
        'amap-maps': {
          isActive: true,
          name: 'amap-maps',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@amap/amap-maps-mcp-server'],
          env: {
            AMAP_MAPS_API_KEY: 'test-key'
          },
          installSource: 'unknown'
        }
      }
    }

    const getSettings = vi.fn(async () => ({ mcpServers: {} }))
    const saveSettings = vi.fn(async () => payload)
    const app = new Hono()

    registerMcpServersRoute(app, {
      mcpServersRepo: {
        getSettings,
        saveSettings
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/mcp-servers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(payload)
    expect(saveSettings).toHaveBeenCalledWith(payload)
  })

  it('returns live health separately from persisted configuration', async () => {
    const health = new McpServerHealthRegistry()
    health.failed('amap-maps')
    const app = new Hono()
    registerMcpServersRoute(app, {
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} })),
        saveSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never,
      mcpServerHealth: health
    })

    const response = await app.request('http://localhost/v1/settings/mcp-servers/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      serverHealth: { 'amap-maps': { state: 'error' } }
    })
  })

  it('returns only the OAuth status for saved MCP servers', async () => {
    const app = new Hono()
    const getStatus = vi.fn(async () => 'signed-in' as const)
    registerMcpServersRoute(app, {
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({
          mcpServers: {
            linear: {
              isActive: true,
              name: 'Linear',
              type: 'http',
              args: [],
              env: {},
              installSource: 'direct',
              url: 'https://mcp.linear.app/mcp'
            }
          }
        })),
        saveSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never,
      mcpOAuthService: { getStatus } as never
    })

    const response = await app.request('http://localhost/v1/settings/mcp-servers/auth')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ auth: { linear: 'signed-in' } })
    expect(getStatus).toHaveBeenCalledWith('linear')
  })

  it('starts OAuth only for a saved MCP server and returns no credentials', async () => {
    const server = {
      isActive: true,
      name: 'Linear',
      type: 'http',
      args: [],
      env: {},
      installSource: 'direct',
      url: 'https://mcp.linear.app/mcp'
    }
    const login = vi.fn(async () => {})
    const getStatus = vi.fn(async () => 'signed-in' as const)
    const app = new Hono()
    registerMcpServersRoute(app, {
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: { linear: server } })),
        saveSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never,
      mcpOAuthService: { login, getStatus } as never
    })

    const response = await app.request(
      'http://localhost/v1/settings/mcp-servers/linear/auth/login',
      {
        method: 'POST'
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ serverId: 'linear', auth: 'signed-in' })
    expect(login).toHaveBeenCalledWith('linear', server)
  })

  it('rejects invalid mcp settings payloads', async () => {
    const app = new Hono()

    registerMcpServersRoute(app, {
      mcpServersRepo: {
        getSettings: vi.fn(async () => ({ mcpServers: {} })),
        saveSettings: vi.fn(async () => ({ mcpServers: {} }))
      } as never
    })

    const response = await app.request('http://localhost/v1/settings/mcp-servers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mcpServers: {
          'amap-maps': {
            isActive: true,
            name: 'amap-maps',
            type: 'stdio'
          }
        }
      })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'command is required when type is stdio'
    })
  })
})
