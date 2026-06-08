import type { Hono } from 'hono'
import { z } from 'zod'
import type { WorkspacesRepository } from '../../persistence/repos/workspaces-repo'

const nonEmptyString = z.string().trim().min(1)

const createWorkspaceSchema = z.object({
  name: nonEmptyString,
  rootPath: nonEmptyString
})

const relocateWorkspaceSchema = z.object({
  rootPath: nonEmptyString
})

type RegisterWorkspacesRouteOptions = {
  workspacesRepo: WorkspacesRepository
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

export function registerWorkspacesRoute(app: Hono, options: RegisterWorkspacesRouteOptions): void {
  app.get('/v1/workspaces', async (context) => {
    const workspaces = await options.workspacesRepo.list()
    return context.json(workspaces)
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

    const workspace = await options.workspacesRepo.create(parsed.data)
    return context.json(workspace, 201)
  })

  app.patch('/v1/workspaces/:workspaceId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = relocateWorkspaceSchema.safeParse(body)
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

    if (existingWorkspace.builtInKind === 'chats') {
      return context.json({ ok: false, error: 'Built-in Chats workspace cannot be relocated' }, 409)
    }

    const workspace = await options.workspacesRepo.relocate(existingWorkspace.id, {
      rootPath: parsed.data.rootPath
    })
    if (!workspace) {
      return context.json({ ok: false, error: 'Workspace not found' }, 404)
    }

    return context.json(workspace)
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
