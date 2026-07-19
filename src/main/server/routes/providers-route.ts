import type { Hono } from 'hono'
import type { ProvidersRepository } from '../../persistence/repos/providers-repo'
import { testProviderConnection } from '../providers/provider-connection-checker'
import {
  createProviderSchema,
  testProviderConnectionSchema,
  updateProviderSchema
} from '../validators/provider-validator'

type RegisterProvidersRouteOptions = {
  providersRepo: ProvidersRepository
}

function parseJsonBodyErrorResponse() {
  return {
    ok: false as const,
    error: 'Invalid JSON body'
  }
}

function providerResponse<T extends { apiKey: string }>(provider: T, includeApiKey: boolean) {
  return {
    ...provider,
    apiKey: includeApiKey ? provider.apiKey : '',
    hasApiKey: provider.apiKey.trim().length > 0
  }
}

function canReadProviderCredentials(authorization: string | undefined): boolean {
  return authorization?.startsWith('Bearer ') === true
}

export function registerProvidersRoute(app: Hono, options: RegisterProvidersRouteOptions): void {
  app.get('/v1/providers', async (context) => {
    const providers = await options.providersRepo.list()
    const includeApiKey = canReadProviderCredentials(context.req.header('Authorization'))
    return context.json(providers.map((provider) => providerResponse(provider, includeApiKey)))
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
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const provider = await options.providersRepo.create(parsed.data)
    return context.json(
      providerResponse(provider, canReadProviderCredentials(context.req.header('Authorization'))),
      201
    )
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
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    const provider = await options.providersRepo.update(context.req.param('providerId'), {
      ...parsed.data,
      ...(parsed.data.apiKey?.trim() ? { apiKey: parsed.data.apiKey } : { apiKey: undefined })
    })
    if (!provider) {
      return context.json({ ok: false, error: 'Provider not found' }, 404)
    }

    return context.json(
      providerResponse(provider, canReadProviderCredentials(context.req.header('Authorization')))
    )
  })

  app.delete('/v1/providers/:providerId', async (context) => {
    const providerId = context.req.param('providerId')
    const provider = await options.providersRepo.getById(providerId)
    if (!provider) {
      return context.json({ ok: false, error: 'Provider not found' }, 404)
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
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    try {
      const savedProvider = parsed.data.providerId
        ? await options.providersRepo.getById(parsed.data.providerId)
        : null
      await testProviderConnection({
        ...parsed.data,
        apiKey: parsed.data.apiKey.trim() || savedProvider?.apiKey || ''
      })
      return context.json({ ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection check failed'
      return context.json({ ok: false, error: message })
    }
  })
}
