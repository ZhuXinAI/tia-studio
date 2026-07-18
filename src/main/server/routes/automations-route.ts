import type { Hono } from 'hono'
import { z } from 'zod'
import type { AutomationService } from '../../automations/automation-service'
import type { AutomationsRepository } from '../../persistence/repos/automations-repo'

const saveAutomationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(20_000),
  status: z.enum(['active', 'paused']),
  rrule: z
    .string()
    .trim()
    .regex(/^(RRULE:)?FREQ=(HOURLY|DAILY|WEEKLY);/, 'Unsupported automation schedule'),
  workspaceId: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().trim().min(1)
})

async function body(context: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    return null
  }
}

export function registerAutomationsRoute(
  app: Hono,
  options: { repository: AutomationsRepository; service: AutomationService }
): void {
  app.get('/v1/automations', async (context) => context.json(await options.repository.list()))

  app.post('/v1/automations', async (context) => {
    const parsed = saveAutomationSchema.safeParse(await body(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    return context.json(await options.repository.create(parsed.data), 201)
  })

  app.put('/v1/automations/:automationId', async (context) => {
    const parsed = saveAutomationSchema.safeParse(await body(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    const updated = await options.repository.update(context.req.param('automationId'), parsed.data)
    return updated ? context.json(updated) : context.json({ error: 'Automation not found' }, 404)
  })

  app.delete('/v1/automations/:automationId', async (context) => {
    const deleted = await options.repository.delete(context.req.param('automationId'))
    return deleted ? context.body(null, 204) : context.json({ error: 'Automation not found' }, 404)
  })

  app.post('/v1/automations/:automationId/run', async (context) => {
    try {
      return context.json(await options.service.runNow(context.req.param('automationId')))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Automation execution failed' },
        404
      )
    }
  })
}
