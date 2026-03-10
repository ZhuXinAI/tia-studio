import type { Hono } from 'hono'
import type { AppProvider, ProvidersRepository } from '../../persistence/repos/providers-repo'
import type { SecuritySettingsRepository } from '../../persistence/repos/security-settings-repo'
import { updateSecuritySettingsSchema } from '../validators/security-settings-validator'

type RegisterSecuritySettingsRouteOptions = {
  securitySettingsRepo: SecuritySettingsRepository
  providersRepo: ProvidersRepository
}

type SecurityProviderOption = {
  id: string
  name: string
  type: string
  selectedModel: string
}

function parseJsonBodyErrorResponse(): {
  ok: false
  error: string
} {
  return {
    ok: false,
    error: 'Invalid JSON body'
  }
}

function isEligibleGuardrailProvider(
  provider: AppProvider | null | undefined
): provider is AppProvider {
  return Boolean(provider && provider.enabled && provider.selectedModel.trim().length > 0)
}

function toProviderOption(provider: AppProvider): SecurityProviderOption {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    selectedModel: provider.selectedModel
  }
}

async function toSecuritySettingsResponse(options: RegisterSecuritySettingsRouteOptions): Promise<{
  promptInjectionEnabled: boolean
  piiDetectionEnabled: boolean
  guardrailProviderId: string | null
  availableProviders: SecurityProviderOption[]
}> {
  const [settings, providers] = await Promise.all([
    options.securitySettingsRepo.getSettings(),
    options.providersRepo.list()
  ])
  const availableProviders = providers.filter(isEligibleGuardrailProvider).map(toProviderOption)
  const hasSelectedProvider =
    settings.guardrailProviderId !== null &&
    availableProviders.some((provider) => provider.id === settings.guardrailProviderId)

  return {
    promptInjectionEnabled: settings.promptInjectionEnabled,
    piiDetectionEnabled: settings.piiDetectionEnabled,
    guardrailProviderId: hasSelectedProvider ? settings.guardrailProviderId : null,
    availableProviders
  }
}

export function registerSecuritySettingsRoute(
  app: Hono,
  options: RegisterSecuritySettingsRouteOptions
): void {
  app.get('/v1/settings/security', async (context) => {
    return context.json(await toSecuritySettingsResponse(options))
  })

  app.patch('/v1/settings/security', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(parseJsonBodyErrorResponse(), 400)
    }

    const parsed = updateSecuritySettingsSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400
      )
    }

    if (parsed.data.guardrailProviderId !== undefined && parsed.data.guardrailProviderId !== null) {
      const provider = await options.providersRepo.getById(parsed.data.guardrailProviderId)
      if (!isEligibleGuardrailProvider(provider)) {
        return context.json(
          {
            ok: false,
            error: 'Guardrail provider must be enabled and have a selected model'
          },
          400
        )
      }
    }

    await options.securitySettingsRepo.saveSettings(parsed.data)
    return context.json(await toSecuritySettingsResponse(options))
  })
}
