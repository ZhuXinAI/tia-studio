import type { ProviderType } from './providers-query'

export const manualProviderTypes = [
  'openai',
  'openai-response',
  'gemini',
  'anthropic',
  'ollama'
] as const satisfies readonly ProviderType[]

export function getVisibleProviderTypeOptions(currentType?: ProviderType): ProviderType[] {
  if (
    !currentType ||
    manualProviderTypes.includes(currentType as (typeof manualProviderTypes)[number])
  ) {
    return [...manualProviderTypes]
  }

  return [...manualProviderTypes, currentType]
}
