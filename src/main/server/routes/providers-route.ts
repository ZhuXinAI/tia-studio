import type { Hono } from 'hono'
import type { AssistantsRepository } from '../../persistence/repos/assistants-repo'
import type { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { testProviderConnection } from '../providers/provider-connection-checker'
import {
  createProviderSchema,
  testProviderConnectionSchema,
  updateProviderSchema
} from '../validators/provider-validator'

type RegisterProvidersRouteOptions = {
  providersRepo: ProvidersRepository
  assistantsRepo: AssistantsRepository
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

  app.delete('/v1/providers/:providerId', async (context) => {
    const providerId = context.req.param('providerId')
    const provider = await options.providersRepo.getById(providerId)
    if (!provider) {
      return context.json({ ok: false, error: 'Provider not found' }, 404)
    }

    const linkedAssistants = await options.assistantsRepo.countByProviderId(providerId)
    if (linkedAssistants > 0) {
      return context.json({ ok: false, error: 'Provider is assigned to one or more assistants' }, 409)
    }

    await options.providersRepo.delete(providerId)
    return context.body(null, 204)
  })

  app.post('/v1/providers/test-connection', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(parseJsonBodyErrorResponse(), 400)
    }

    const parsed = testProviderConnectionSchema.safeParse(body)
    if (!parsed.success) {
      return context.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }, 400)
    }

    try {
      await testProviderConnection(parsed.data)
      return context.json({ ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection check failed'
      return context.json({ ok: false, error: message })
    }
  })
}
