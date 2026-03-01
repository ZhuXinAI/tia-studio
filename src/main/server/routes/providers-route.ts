import type { Hono } from 'hono'
import type { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { createProviderSchema, updateProviderSchema } from '../validators/provider-validator'

type RegisterProvidersRouteOptions = {
  providersRepo: ProvidersRepository
}

function parseJsonBodyErrorResponse() {
  return {
    ok: false as const,
    error: 'Invalid JSON body'
  }
}

export function registerProvidersRoute(app: Hono, options: RegisterProvidersRouteOptions): void {
  app.get('/v1/providers', async (context) => {
    const providers = await options.providersRepo.list()
    return context.json(providers)
  })

  app.post('/v1/providers', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(parseJsonBodyErrorResponse(), 400)
    }

    const parsed = createProviderSchema.safeParse(body)
    if (!parsed.success) {
      return context.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }, 400)
    }

    const provider = await options.providersRepo.create(parsed.data)
    return context.json(provider, 201)
  })

  app.patch('/v1/providers/:providerId', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(parseJsonBodyErrorResponse(), 400)
    }

    const parsed = updateProviderSchema.safeParse(body)
    if (!parsed.success) {
      return context.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }, 400)
    }

    const provider = await options.providersRepo.update(context.req.param('providerId'), parsed.data)
    if (!provider) {
      return context.json({ ok: false, error: 'Provider not found' }, 404)
    }

    return context.json(provider)
  })
}
