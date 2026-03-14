import type { Hono } from 'hono'
import type { GroupWorkspacesRepository } from '../../persistence/repos/group-workspaces-repo'
import {
  createGroupSchema,
  replaceGroupMembersSchema,
  updateGroupSchema
} from '../validators/group-validator'

type RegisterGroupGroupsRouteOptions = {
  groupsRepo: GroupWorkspacesRepository
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

function toGroupMemberRecord(member: {
  workspaceId: string
  assistantId: string
  sortOrder: number
  createdAt: string
}) {
  return {
    groupId: member.workspaceId,
    assistantId: member.assistantId,
    sortOrder: member.sortOrder,
    createdAt: member.createdAt
  }
}

export function registerGroupGroupsRoute(
  app: Hono,
  options: RegisterGroupGroupsRouteOptions
): void {
  app.get('/v1/group/groups', async (context) => {
    const groups = await options.groupsRepo.list()
    return context.json(groups)
  })

  app.post('/v1/group/groups', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = createGroupSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const group = await options.groupsRepo.create({
      name: parsed.data.name,
      rootPath: ''
    })
    await options.groupsRepo.replaceMembers(group.id, parsed.data.assistantIds)
    return context.json(group, 201)
  })

  app.patch('/v1/group/groups/:groupId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = updateGroupSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const group = await options.groupsRepo.update(context.req.param('groupId'), parsed.data)
    if (!group) {
      return context.json({ ok: false, error: 'Group not found' }, 404)
    }

    return context.json(group)
  })

  app.get('/v1/group/groups/:groupId/members', async (context) => {
    const existingGroup = await options.groupsRepo.getById(context.req.param('groupId'))
    if (!existingGroup) {
      return context.json({ ok: false, error: 'Group not found' }, 404)
    }

    const members = await options.groupsRepo.listMembers(existingGroup.id)
    return context.json(members.map((member) => toGroupMemberRecord(member)))
  })

  app.put('/v1/group/groups/:groupId/members', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = replaceGroupMembersSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const existingGroup = await options.groupsRepo.getById(context.req.param('groupId'))
    if (!existingGroup) {
      return context.json({ ok: false, error: 'Group not found' }, 404)
    }

    await options.groupsRepo.replaceMembers(existingGroup.id, parsed.data.assistantIds)
    const members = await options.groupsRepo.listMembers(existingGroup.id)
    return context.json(members.map((member) => toGroupMemberRecord(member)))
  })

  app.delete('/v1/group/groups/:groupId', async (context) => {
    const deleted = await options.groupsRepo.delete(context.req.param('groupId'))
    if (!deleted) {
      return context.json({ ok: false, error: 'Group not found' }, 404)
    }

    return context.body(null, 204)
  })
}
