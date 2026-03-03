import type { Hono } from 'hono'
import type { McpServersRepository } from '../../persistence/repos/mcp-servers-repo'
import { updateMcpServersSettingsSchema } from '../validators/mcp-servers-validator'

type RegisterMcpServersRouteOptions = {
  mcpServersRepo: McpServersRepository
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

export function registerMcpServersRoute(
  app: Hono,
  options: RegisterMcpServersRouteOptions
): void {
  app.get('/v1/settings/mcp-servers', async (context) => {
    try {
      const settings = await options.mcpServersRepo.getSettings()
      return context.json(settings)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load MCP servers settings'
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
      return context.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }, 400)
    }

    try {
      const settings = await options.mcpServersRepo.saveSettings(parsed.data)
      return context.json(settings)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save MCP servers settings'
      return context.json({ ok: false, error: message }, 500)
    }
  })
}
