import type { Hono } from 'hono'
import { z } from 'zod'
import type { AppAgentRuntime } from '../../../shared/agent-runtime'
import type { GitReviewService } from '../../git/git-review-service'

const pathsSchema = z.object({
  paths: z.array(z.string().trim().min(1)).min(1).max(200)
})

async function body(context: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    return null
  }
}

export function registerGitRoute(
  app: Hono,
  options: { runtime: AppAgentRuntime; git: GitReviewService }
): void {
  app.get('/v1/agent/sessions/:sessionId/git/review', async (context) => {
    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      return context.json(await options.git.inspect(session.workspacePath))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Git review failed' },
        409
      )
    }
  })

  app.post('/v1/agent/sessions/:sessionId/git/stage', async (context) => {
    const parsed = pathsSchema.safeParse(await body(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      await options.git.stage(session.workspacePath, parsed.data.paths)
      return context.json(await options.git.inspect(session.workspacePath))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Could not stage changes' },
        409
      )
    }
  })

  app.post('/v1/agent/sessions/:sessionId/git/unstage', async (context) => {
    const parsed = pathsSchema.safeParse(await body(context))
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message }, 400)
    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      await options.git.unstage(session.workspacePath, parsed.data.paths)
      return context.json(await options.git.inspect(session.workspacePath))
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'Could not unstage changes' },
        409
      )
    }
  })
}
