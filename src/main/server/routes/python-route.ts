import type { Hono } from 'hono'
import { z } from 'zod'
import type { AppAgentRuntime } from '../../../shared/agent-runtime'
import type { PythonToolingService } from '../../python/python-tooling-service'

const checkSchema = z.object({ kind: z.enum(['compile', 'pytest']) })

async function body(context: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    return null
  }
}

export function registerPythonRoute(
  app: Hono,
  options: { runtime: AppAgentRuntime; python: PythonToolingService }
): void {
  app.get('/v1/agent/sessions/:sessionId/python', async (context) => {
    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      return context.json(await options.python.inspect(session.workspacePath))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Python inspection failed' },
        409
      )
    }
  })

  app.post('/v1/agent/sessions/:sessionId/python/check', async (context) => {
    const parsed = checkSchema.safeParse(await body(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      return context.json(await options.python.runCheck(session.workspacePath, parsed.data.kind))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Python check failed' },
        409
      )
    }
  })
}
