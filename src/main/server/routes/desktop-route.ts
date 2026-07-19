import type { Context, Hono } from 'hono'
import { z } from 'zod'
import type {
  ManagedRuntimeKind,
  ManagedRuntimesState
} from '../../persistence/repos/managed-runtimes-repo'
import type { RecommendedSkillId } from '../../skills/skills-manager'
import { supportedUiLanguages, type UiConfig } from '../../ui-config'
import type { AutoUpdateState } from '../../auto-updater'
import type { DesktopBootstrap } from '../../../shared/desktop-bootstrap'
import type {
  DesktopSkillCatalogPage,
  DesktopSkillCatalogQuery
} from '../../../shared/desktop-discovery'
import type { SkillMarketplaceRecord } from '../../../shared/skill-marketplace'

const uiConfigSchema = z.object({
  transparent: z.boolean().optional(),
  language: z.enum(supportedUiLanguages).nullable().optional()
})

const autoUpdateSchema = z.object({
  enabled: z.boolean()
})

const managedRuntimeKindSchema = z.enum(['agent-browser', 'bun', 'uv'])

const runtimeOnboardingSkillIdSchema = z.enum(['agent-browser', 'find-skills'])
const desktopSkillSourceSchema = z.enum([
  'global-codex',
  'global-claude',
  'global-agent',
  'global-agent-legacy',
  'workspace'
])

const runtimeOnboardingSkillsSchema = z.object({
  skillIds: z.array(runtimeOnboardingSkillIdSchema)
})

const desktopSkillCatalogQuerySchema = z.object({
  cursor: z.string().regex(/^\d+$/, 'Cursor must be a non-negative integer').optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().max(200).optional(),
  source: desktopSkillSourceSchema.optional()
})
const marketplaceInstallSchema = z.object({
  skillId: z.string().min(1)
})

type RegisterDesktopRouteOptions = {
  getDesktopBootstrap: () => DesktopBootstrap
  getUiConfig: () => UiConfig
  setUiConfig: (config: UiConfig) => UiConfig
  getSystemLocale: () => string
  getAutoUpdateState: () => AutoUpdateState
  setAutoUpdateEnabled: (enabled: boolean) => Promise<AutoUpdateState>
  checkForUpdates: () => Promise<AutoUpdateState>
  restartToUpdate: () => void
  getManagedRuntimeStatus: () => Promise<ManagedRuntimesState>
  checkManagedRuntimeLatest: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
  installManagedRuntime: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
  pickCustomRuntime: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState | null>
  clearManagedRuntime: (kind: ManagedRuntimeKind) => Promise<ManagedRuntimesState>
  getRuntimeOnboardingSkillsStatus: () => Promise<RecommendedSkillId[]>
  installRuntimeOnboardingSkills: (skillIds: RecommendedSkillId[]) => Promise<RecommendedSkillId[]>
  listSkillsCatalogPage: (query: DesktopSkillCatalogQuery) => Promise<DesktopSkillCatalogPage>
  listSkillMarketplace: () => Promise<SkillMarketplaceRecord[]>
  installMarketplaceSkill: (input: { skillId: string }) => Promise<void>
  pickDirectory: () => Promise<string | null>
}

function invalidBodyResponse(): { ok: false; error: string } {
  return { ok: false as const, error: 'Invalid JSON body' }
}

function invalidParamResponse(error: string): { ok: false; error: string } {
  return { ok: false as const, error }
}

async function readValidatedJsonBody<T>(
  context: Context,
  schema: z.ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return {
      ok: false,
      response: context.json(invalidBodyResponse(), 400)
    }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }
  }

  return { ok: true, data: parsed.data }
}

function readManagedRuntimeKind(context: Context):
  | {
      ok: true
      kind: ManagedRuntimeKind
    }
  | {
      ok: false
      response: Response
    } {
  const parsed = managedRuntimeKindSchema.safeParse(context.req.param('kind'))
  if (!parsed.success) {
    return {
      ok: false,
      response: context.json(invalidParamResponse('Managed runtime kind is invalid'), 400)
    }
  }

  return { ok: true, kind: parsed.data }
}

export function registerDesktopRoute(app: Hono, options: RegisterDesktopRouteOptions): void {
  app.get('/v1/desktop/bootstrap', (context) => {
    return context.json(options.getDesktopBootstrap())
  })

  app.get('/v1/desktop/ui-config', (context) => {
    return context.json(options.getUiConfig())
  })

  app.patch('/v1/desktop/ui-config', async (context) => {
    const parsed = await readValidatedJsonBody(context, uiConfigSchema)
    if (!parsed.ok) {
      return parsed.response
    }

    return context.json(options.setUiConfig(parsed.data))
  })

  app.get('/v1/desktop/system-locale', (context) => {
    return context.json({ locale: options.getSystemLocale() })
  })

  app.get('/v1/desktop/auto-update', (context) => {
    return context.json(options.getAutoUpdateState())
  })

  app.patch('/v1/desktop/auto-update', async (context) => {
    const parsed = await readValidatedJsonBody(context, autoUpdateSchema)
    if (!parsed.ok) {
      return parsed.response
    }

    return context.json(await options.setAutoUpdateEnabled(parsed.data.enabled))
  })

  app.post('/v1/desktop/auto-update/check', async (context) => {
    return context.json(await options.checkForUpdates())
  })

  app.post('/v1/desktop/auto-update/restart', (context) => {
    try {
      options.restartToUpdate()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restart to update'
      return context.json({ ok: false as const, error: message }, 409)
    }

    return context.body(null, 204)
  })

  app.get('/v1/desktop/managed-runtimes', async (context) => {
    return context.json(await options.getManagedRuntimeStatus())
  })

  app.post('/v1/desktop/managed-runtimes/:kind/check-latest', async (context) => {
    const parsed = readManagedRuntimeKind(context)
    if (!parsed.ok) {
      return parsed.response
    }

    return context.json(await options.checkManagedRuntimeLatest(parsed.kind))
  })

  app.post('/v1/desktop/managed-runtimes/:kind/install', async (context) => {
    const parsed = readManagedRuntimeKind(context)
    if (!parsed.ok) {
      return parsed.response
    }

    return context.json(await options.installManagedRuntime(parsed.kind))
  })

  app.post('/v1/desktop/managed-runtimes/:kind/pick-custom', async (context) => {
    const parsed = readManagedRuntimeKind(context)
    if (!parsed.ok) {
      return parsed.response
    }

    return context.json(await options.pickCustomRuntime(parsed.kind))
  })

  app.delete('/v1/desktop/managed-runtimes/:kind/custom', async (context) => {
    const parsed = readManagedRuntimeKind(context)
    if (!parsed.ok) {
      return parsed.response
    }

    return context.json(await options.clearManagedRuntime(parsed.kind))
  })

  app.get('/v1/desktop/runtime-onboarding-skills', async (context) => {
    return context.json({
      skillIds: await options.getRuntimeOnboardingSkillsStatus()
    })
  })

  app.post('/v1/desktop/runtime-onboarding-skills/install', async (context) => {
    const parsed = await readValidatedJsonBody(context, runtimeOnboardingSkillsSchema)
    if (!parsed.ok) {
      return parsed.response
    }

    return context.json({
      skillIds: await options.installRuntimeOnboardingSkills(parsed.data.skillIds)
    })
  })

  app.get('/v1/desktop/skills', async (context) => {
    const parsed = desktopSkillCatalogQuerySchema.safeParse({
      cursor: context.req.query('cursor') ?? undefined,
      limit: context.req.query('limit') ?? undefined,
      search: context.req.query('search') ?? undefined,
      source: context.req.query('source') ?? undefined
    })
    if (!parsed.success) {
      return context.json(
        { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    return context.json({
      ...(await options.listSkillsCatalogPage(parsed.data))
    })
  })

  app.get('/v1/desktop/skill-marketplace', async (context) => {
    return context.json({
      skills: await options.listSkillMarketplace()
    })
  })

  app.post('/v1/desktop/skill-marketplace/install', async (context) => {
    const parsed = await readValidatedJsonBody(context, marketplaceInstallSchema)
    if (!parsed.ok) return parsed.response
    try {
      await options.installMarketplaceSkill(parsed.data)
      return context.json({ ok: true as const })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown installation error'
      return context.json(
        { ok: false as const, error: `Skill installation failed: ${message}` },
        502
      )
    }
  })

  app.post('/v1/desktop/dialogs/pick-directory', async (context) => {
    return context.json({
      path: await options.pickDirectory()
    })
  })
}
