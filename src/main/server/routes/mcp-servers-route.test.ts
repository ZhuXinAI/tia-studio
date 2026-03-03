import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerMcpServersRoute } from './mcp-servers-route'

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
