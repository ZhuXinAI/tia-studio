import type { Hono } from 'hono'
import type { GroupThreadsRepository } from '../../persistence/repos/group-threads-repo'
import type { GroupWorkspacesRepository } from '../../persistence/repos/group-workspaces-repo'
import { createGroupThreadSchema, updateGroupThreadSchema } from '../validators/group-validator'

type RegisterGroupThreadsRouteOptions = {
  groupThreadsRepo: GroupThreadsRepository
  groupWorkspacesRepo?: GroupWorkspacesRepository
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

export function registerGroupThreadsRoute(
  app: Hono,
  options: RegisterGroupThreadsRouteOptions
): void {
  app.get('/v1/group/threads', async (context) => {
    const workspaceId = context.req.query('workspaceId')
    if (!workspaceId) {
      return context.json({ ok: false, error: 'workspaceId query is required' }, 400)
    }

    const threads = await options.groupThreadsRepo.listByWorkspace(workspaceId)
    return context.json(threads)
  })

  app.post('/v1/group/threads', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = createGroupThreadSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    if (options.groupWorkspacesRepo) {
      const workspace = await options.groupWorkspacesRepo.getById(parsed.data.workspaceId)
      if (!workspace) {
        return context.json({ ok: false, error: 'Group workspace not found' }, 400)
      }
    }

    const thread = await options.groupThreadsRepo.create({
      ...parsed.data,
      title: parsed.data.title ?? ''
    })
    return context.json(thread, 201)
  })

  app.patch('/v1/group/threads/:threadId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = updateGroupThreadSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const thread = await options.groupThreadsRepo.update(context.req.param('threadId'), parsed.data)
    if (!thread) {
      return context.json({ ok: false, error: 'Group thread not found' }, 404)
    }

    return context.json(thread)
  })

  app.delete('/v1/group/threads/:threadId', async (context) => {
    const deleted = await options.groupThreadsRepo.delete(context.req.param('threadId'))
    if (!deleted) {
      return context.json({ ok: false, error: 'Group thread not found' }, 404)
    }

    return context.body(null, 204)
  })
}
