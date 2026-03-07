import type { Hono } from 'hono'
import type { ProvidersRepository } from '../../persistence/repos/providers-repo'
import type { TeamThreadsRepository } from '../../persistence/repos/team-threads-repo'
import type { TeamWorkspacesRepository } from '../../persistence/repos/team-workspaces-repo'
import {
  createTeamThreadSchema,
  replaceTeamThreadMembersSchema,
  updateTeamThreadSchema
} from '../validators/team-validator'

type RegisterTeamThreadsRouteOptions = {
  teamThreadsRepo: TeamThreadsRepository
  teamWorkspacesRepo?: TeamWorkspacesRepository
  providersRepo?: ProvidersRepository
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

export function registerTeamThreadsRoute(app: Hono, options: RegisterTeamThreadsRouteOptions): void {
  app.get('/v1/team/threads', async (context) => {
    const workspaceId = context.req.query('workspaceId')
    if (!workspaceId) {
      return context.json({ ok: false, error: 'workspaceId query is required' }, 400)
    }

    const threads = await options.teamThreadsRepo.listByWorkspace(workspaceId)
    return context.json(threads)
  })

  app.get('/v1/team/threads/:threadId/members', async (context) => {
    const existingThread = await options.teamThreadsRepo.getById(context.req.param('threadId'))
    if (!existingThread) {
      return context.json({ ok: false, error: 'Team thread not found' }, 404)
    }

    const members = await options.teamThreadsRepo.listMembers(existingThread.id)
    return context.json(members)
  })

  app.post('/v1/team/threads', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = createTeamThreadSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    if (options.teamWorkspacesRepo) {
      const workspace = await options.teamWorkspacesRepo.getById(parsed.data.workspaceId)
      if (!workspace) {
        return context.json({ ok: false, error: 'Team workspace not found' }, 400)
      }
    }

    const thread = await options.teamThreadsRepo.create({
      ...parsed.data,
      title: parsed.data.title ?? ''
    })
    return context.json(thread, 201)
  })

  app.patch('/v1/team/threads/:threadId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = updateTeamThreadSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    if (parsed.data.supervisorProviderId && options.providersRepo) {
      const provider = await options.providersRepo.getById(parsed.data.supervisorProviderId)
      if (!provider) {
        return context.json({ ok: false, error: 'Supervisor provider not found' }, 400)
      }
    }

    const thread = await options.teamThreadsRepo.update(context.req.param('threadId'), parsed.data)
    if (!thread) {
      return context.json({ ok: false, error: 'Team thread not found' }, 404)
    }

    return context.json(thread)
  })

  app.put('/v1/team/threads/:threadId/members', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = replaceTeamThreadMembersSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const existingThread = await options.teamThreadsRepo.getById(context.req.param('threadId'))
    if (!existingThread) {
      return context.json({ ok: false, error: 'Team thread not found' }, 404)
    }

    await options.teamThreadsRepo.replaceMembers(existingThread.id, parsed.data.assistantIds)
    const members = await options.teamThreadsRepo.listMembers(existingThread.id)
    return context.json(members)
  })

  app.delete('/v1/team/threads/:threadId', async (context) => {
    const deleted = await options.teamThreadsRepo.delete(context.req.param('threadId'))
    if (!deleted) {
      return context.json({ ok: false, error: 'Team thread not found' }, 404)
    }

    return context.body(null, 204)
  })
}
