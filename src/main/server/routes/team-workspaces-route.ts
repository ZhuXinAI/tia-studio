import type { Hono } from 'hono'
import type { ProvidersRepository } from '../../persistence/repos/providers-repo'
import type { TeamWorkspacesRepository } from '../../persistence/repos/team-workspaces-repo'
import {
  createTeamWorkspaceSchema,
  replaceTeamWorkspaceMembersSchema,
  updateTeamWorkspaceSchema
} from '../validators/team-validator'

type RegisterTeamWorkspacesRouteOptions = {
  teamWorkspacesRepo: TeamWorkspacesRepository
  providersRepo?: ProvidersRepository
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

export function registerTeamWorkspacesRoute(
  app: Hono,
  options: RegisterTeamWorkspacesRouteOptions
): void {
  app.get('/v1/team/workspaces', async (context) => {
    const workspaces = await options.teamWorkspacesRepo.list()
    return context.json(workspaces)
  })

  app.post('/v1/team/workspaces', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = createTeamWorkspaceSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const workspace = await options.teamWorkspacesRepo.create(parsed.data)
    return context.json(workspace, 201)
  })

  app.patch('/v1/team/workspaces/:workspaceId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = updateTeamWorkspaceSchema.safeParse(body)
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

    const workspace = await options.teamWorkspacesRepo.update(
      context.req.param('workspaceId'),
      parsed.data
    )
    if (!workspace) {
      return context.json({ ok: false, error: 'Team workspace not found' }, 404)
    }

    return context.json(workspace)
  })

  app.get('/v1/team/workspaces/:workspaceId/members', async (context) => {
    const existingWorkspace = await options.teamWorkspacesRepo.getById(context.req.param('workspaceId'))
    if (!existingWorkspace) {
      return context.json({ ok: false, error: 'Team workspace not found' }, 404)
    }

    const members = await options.teamWorkspacesRepo.listMembers(existingWorkspace.id)
    return context.json(members)
  })

  app.put('/v1/team/workspaces/:workspaceId/members', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(invalidBodyResponse(), 400)
    }

    const parsed = replaceTeamWorkspaceMembersSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const existingWorkspace = await options.teamWorkspacesRepo.getById(context.req.param('workspaceId'))
    if (!existingWorkspace) {
      return context.json({ ok: false, error: 'Team workspace not found' }, 404)
    }

    await options.teamWorkspacesRepo.replaceMembers(existingWorkspace.id, parsed.data.assistantIds)
    const members = await options.teamWorkspacesRepo.listMembers(existingWorkspace.id)
    return context.json(members)
  })

  app.delete('/v1/team/workspaces/:workspaceId', async (context) => {
    const deleted = await options.teamWorkspacesRepo.delete(context.req.param('workspaceId'))
    if (!deleted) {
      return context.json({ ok: false, error: 'Team workspace not found' }, 404)
    }

    return context.body(null, 204)
  })
}
