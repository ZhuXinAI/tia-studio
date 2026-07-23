import type { Hono } from 'hono'
import type { McpOAuthService } from '../../mcp/mcp-oauth'
import type { McpServersRepository } from '../../persistence/repos/mcp-servers-repo'
import type { McpServerHealthRegistry } from '../../agents/pi/mcp-server-health'
import { updateMcpServersSettingsSchema } from '../validators/mcp-servers-validator'

type RegisterMcpServersRouteOptions = {
  mcpServersRepo: McpServersRepository
  mcpOAuthService?: McpOAuthService
  mcpServerHealth?: McpServerHealthRegistry
}

function parseJsonBodyErrorResponse(): {
  ok: false
  error: string
} {
  return {
    ok: false,
    error: 'Invalid JSON body'
  }
}

export function registerMcpServersRoute(app: Hono, options: RegisterMcpServersRouteOptions): void {
  app.get('/v1/settings/mcp-servers', async (context) => {
    try {
      const settings = await options.mcpServersRepo.getSettings()
      return context.json(settings)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load MCP servers settings'
      return context.json({ ok: false, error: message }, 500)
    }
  })

  app.get('/v1/settings/mcp-servers/health', (context) => {
    return context.json({ serverHealth: options.mcpServerHealth?.list() ?? {} })
  })

  app.get('/v1/settings/mcp-servers/auth', async (context) => {
    if (!options.mcpOAuthService) {
      return context.json({ ok: false, error: 'MCP OAuth is not available' }, 503)
    }
    try {
      const settings = await options.mcpServersRepo.getSettings()
      const entries = await Promise.all(
        Object.keys(settings.mcpServers).map(async (serverId) => [
          serverId,
          await options.mcpOAuthService!.getStatus(serverId)
        ])
      )
      return context.json({ auth: Object.fromEntries(entries) })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load MCP authentication status'
      return context.json({ ok: false, error: message }, 500)
    }
  })

  app.post('/v1/settings/mcp-servers/:serverId/auth/login', async (context) => {
    if (!options.mcpOAuthService) {
      return context.json({ ok: false, error: 'MCP OAuth is not available' }, 503)
    }
    try {
      const serverId = context.req.param('serverId')
      const server = (await options.mcpServersRepo.getSettings()).mcpServers[serverId]
      if (!server) return context.json({ ok: false, error: 'MCP server not found' }, 404)
      await options.mcpOAuthService.login(serverId, server)
      return context.json({ serverId, auth: await options.mcpOAuthService.getStatus(serverId) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MCP sign-in could not be completed'
      return context.json({ ok: false, error: message }, 400)
    }
  })

  app.delete('/v1/settings/mcp-servers/:serverId/auth', async (context) => {
    if (!options.mcpOAuthService) {
      return context.json({ ok: false, error: 'MCP OAuth is not available' }, 503)
    }
    try {
      const serverId = context.req.param('serverId')
      const server = (await options.mcpServersRepo.getSettings()).mcpServers[serverId]
      if (!server) return context.json({ ok: false, error: 'MCP server not found' }, 404)
      await options.mcpOAuthService.logout(serverId)
      return context.json({ serverId, auth: await options.mcpOAuthService.getStatus(serverId) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MCP sign-out could not be completed'
      return context.json({ ok: false, error: message }, 500)
    }
  })

  app.put('/v1/settings/mcp-servers', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(parseJsonBodyErrorResponse(), 400)
    }

    const parsed = updateMcpServersSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const settings = await options.mcpServersRepo.saveSettings(parsed.data)
      options.mcpServerHealth?.retain(Object.keys(settings.mcpServers))
      return context.json(settings)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save MCP servers settings'
      return context.json({ ok: false, error: message }, 500)
    }
  })
}
