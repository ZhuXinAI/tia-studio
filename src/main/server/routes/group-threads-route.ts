import type { Hono } from 'hono'
import type { AppGroupThread, GroupThreadsRepository } from '../../persistence/repos/group-threads-repo'
import type { GroupWorkspacesRepository } from '../../persistence/repos/group-workspaces-repo'
import { createGroupThreadSchema, updateGroupThreadSchema } from '../validators/group-validator'

type RegisterGroupThreadsRouteOptions = {
  groupThreadsRepo: GroupThreadsRepository
  groupsRepo?: GroupWorkspacesRepository
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

function toGroupThreadRecord(thread: AppGroupThread) {
  return {
    id: thread.id,
    groupId: thread.workspaceId,
    resourceId: thread.resourceId,
    title: thread.title,
    lastMessageAt: thread.lastMessageAt,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt
  }
}

export function registerGroupThreadsRoute(
  app: Hono,
  options: RegisterGroupThreadsRouteOptions
): void {
  app.get('/v1/group/threads', async (context) => {
    const groupId = context.req.query('groupId')
    if (!groupId) {
      return context.json({ ok: false, error: 'groupId query is required' }, 400)
    }

    const threads = await options.groupThreadsRepo.listByWorkspace(groupId)
    return context.json(threads.map((thread) => toGroupThreadRecord(thread)))
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

    if (options.groupsRepo) {
      const group = await options.groupsRepo.getById(parsed.data.groupId)
      if (!group) {
        return context.json({ ok: false, error: 'Group not found' }, 400)
      }
    }

    const thread = await options.groupThreadsRepo.create({
      workspaceId: parsed.data.groupId,
      resourceId: parsed.data.resourceId,
      title: parsed.data.title ?? ''
    })
    return context.json(toGroupThreadRecord(thread), 201)
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

    return context.json(toGroupThreadRecord(thread))
  })

  app.delete('/v1/group/threads/:threadId', async (context) => {
    const deleted = await options.groupThreadsRepo.delete(context.req.param('threadId'))
    if (!deleted) {
      return context.json({ ok: false, error: 'Group thread not found' }, 404)
    }

    return context.body(null, 204)
  })
}
