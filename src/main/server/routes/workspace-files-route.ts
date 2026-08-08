import type { Hono } from 'hono'
import { z } from 'zod'
import type { AppAgentRuntime } from '../../../shared/agent-runtime'
import { workspaceFileLimits } from '../../../shared/workspace-files'
import {
  WorkspaceFileError,
  type WorkspaceFileService
} from '../../workspaces/workspace-file-service'

const writeFileSchema = z.object({
  path: z.string().min(1).max(4_000),
  content: z.string().max(workspaceFileLimits.maxTextFileBytes * 2),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/)
})

async function readJson(context: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    return null
  }
}

function fileErrorResponse(error: unknown): {
  body: { ok: false; error: string }
  status: 400 | 403 | 404 | 409 | 413 | 415
} {
  if (!(error instanceof WorkspaceFileError)) {
    return {
      body: {
        ok: false,
        error: error instanceof Error ? error.message : 'Workspace file request failed'
      },
      status: 400
    }
  }
  if (error.code === 'conflict') return { body: { ok: false, error: error.message }, status: 409 }
  if (error.code === 'too-large') return { body: { ok: false, error: error.message }, status: 413 }
  if (error.code === 'binary') return { body: { ok: false, error: error.message }, status: 415 }
  if (error.code === 'unsafe-path' || error.code === 'forbidden') {
    return { body: { ok: false, error: error.message }, status: 403 }
  }
  if (error.code === 'not-found') return { body: { ok: false, error: error.message }, status: 404 }
  return { body: { ok: false, error: error.message }, status: 400 }
}

type WorkspaceFilesRouteOptions = {
  runtime: AppAgentRuntime
  files: WorkspaceFileService
}

export function registerWorkspaceFilesRoute(app: Hono, options: WorkspaceFilesRouteOptions): void {
  app.get('/v1/agent/sessions/:sessionId/files', async (context) => {
    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      return context.json(
        await options.files.listDirectory(session.workspacePath, context.req.query('path') ?? '')
      )
    } catch (error) {
      const response = fileErrorResponse(error)
      return context.json(response.body, response.status)
    }
  })

  app.get('/v1/agent/sessions/:sessionId/files/content', async (context) => {
    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      return context.json(
        await options.files.readFile(session.workspacePath, context.req.query('path') ?? '')
      )
    } catch (error) {
      const response = fileErrorResponse(error)
      return context.json(response.body, response.status)
    }
  })

  app.put('/v1/agent/sessions/:sessionId/files/content', async (context) => {
    const parsed = writeFileSchema.safeParse(await readJson(context))
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid file body' },
        400
      )
    }

    try {
      const session = await options.runtime.getSession(context.req.param('sessionId'))
      return context.json(
        await options.files.writeFile(
          session.workspacePath,
          parsed.data.path,
          parsed.data.content,
          parsed.data.expectedSha256
        )
      )
    } catch (error) {
      const response = fileErrorResponse(error)
      return context.json(response.body, response.status)
    }
  })
}
