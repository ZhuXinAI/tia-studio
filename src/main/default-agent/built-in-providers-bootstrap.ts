import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import { BUILT_IN_PROVIDERS } from './built-in-providers'

export async function ensureBuiltInProviders(providersRepo: ProvidersRepository): Promise<void> {
  const existingProviders = await providersRepo.list()
  const existingIds = new Set(existingProviders.map((p) => p.id))

  for (const builtInConfig of BUILT_IN_PROVIDERS) {
    if (existingIds.has(builtInConfig.id)) {
      continue
    }

    await providersRepo.create({
      id: builtInConfig.id,
      name: builtInConfig.name,
      type: builtInConfig.type,
      apiKey: '',
      apiHost: builtInConfig.apiHost ?? null,
      selectedModel: builtInConfig.defaultModel,
      enabled: false,
      supportsVision: builtInConfig.supportsVision,
      isBuiltIn: true,
      icon: builtInConfig.icon,
      officialSite: builtInConfig.officialSite
    })
  }
}
