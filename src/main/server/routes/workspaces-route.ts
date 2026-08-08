import type { Hono } from 'hono'
import { isAbsolute, resolve } from 'node:path'
import { z } from 'zod'
import type { WorkspacesRepository } from '../../persistence/repos/workspaces-repo'
import type { ComposerMentions } from '../../../shared/composer-mentions'

const nonEmptyString = z.string().trim().min(1)
const workspaceRootPath = nonEmptyString
  .refine((value) => isAbsolute(value), 'Workspace root path must be absolute')
  .transform((value) => resolve(value))

const createWorkspaceSchema = z.object({
  name: nonEmptyString.max(120),
  rootPath: workspaceRootPath
})

const updateWorkspaceSchema = z
  .object({
    name: nonEmptyString.max(120).optional(),
    rootPath: workspaceRootPath.optional()
  })
  .refine((value) => Boolean(value.name || value.rootPath), 'Name or root path is required')

type RegisterWorkspacesRouteOptions = {
  workspacesRepo: WorkspacesRepository
  getComposerMentions?: (workspacePath: string) => Promise<ComposerMentions>
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

export function registerWorkspacesRoute(app: Hono, options: RegisterWorkspacesRouteOptions): void {
  app.get('/v1/workspaces', async (context) => {
    const workspaces = await options.workspacesRepo.list()
    return context.json(workspaces)
  })

  app.get('/v1/workspaces/:workspaceId/composer-mentions', async (context) => {
    if (!options.getComposerMentions) {
      return context.json({ ok: false, error: 'Composer mentions are unavailable' }, 404)
    }

    const workspace = await options.workspacesRepo.getById(context.req.param('workspaceId'))
    if (!workspace || workspace.isMissing) {
      return context.json({ ok: false, error: 'Workspace not found' }, 404)
    }

    return context.json(await options.getComposerMentions(workspace.rootPath))
  })

  app.post('/v1/workspaces', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = createWorkspaceSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const workspace = await options.workspacesRepo.create(parsed.data)
      return context.json(workspace, 201)
    } catch (error) {
      return context.json(
        { ok: false, error: error instanceof Error ? error.message : 'Workspace could not be created' },
        409
      )
    }
  })

  app.patch('/v1/workspaces/:workspaceId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = updateWorkspaceSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const existingWorkspace = await options.workspacesRepo.getById(context.req.param('workspaceId'))
    if (!existingWorkspace) {
      return context.json({ ok: false, error: 'Workspace not found' }, 404)
    }

    if (existingWorkspace.builtInKind === 'chats' && parsed.data.rootPath) {
      return context.json({ ok: false, error: 'Built-in Chats workspace cannot be relocated' }, 409)
    }

    if (existingWorkspace.builtInKind === 'chats' && parsed.data.name) {
      return context.json({ ok: false, error: 'Built-in Chats workspace cannot be renamed' }, 409)
    }

    try {
      const workspace = await options.workspacesRepo.update(existingWorkspace.id, parsed.data)
      if (!workspace) {
        return context.json({ ok: false, error: 'Workspace not found' }, 404)
      }

      return context.json(workspace)
    } catch (error) {
      return context.json(
        { ok: false, error: error instanceof Error ? error.message : 'Workspace could not be updated' },
        409
      )
    }
  })

  app.delete('/v1/workspaces/:workspaceId', async (context) => {
    const result = await options.workspacesRepo.delete(context.req.param('workspaceId'))

    if (result === 'built-in') {
      return context.json({ ok: false, error: 'Built-in Chats workspace cannot be deleted' }, 409)
    }

    if (result === 'missing') {
      return context.json({ ok: false, error: 'Workspace not found' }, 404)
    }

    return context.body(null, 204)
  })
}
