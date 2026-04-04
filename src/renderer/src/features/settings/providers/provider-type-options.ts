import type { ProviderType } from './providers-query'

export const manualModelProviderTypes = [
  'openai',
  'openai-response',
  'gemini',
  'anthropic',
  'ollama'
] as const satisfies readonly ProviderType[]

export const manualAcpProviderTypes = [
  'codex-acp',
  'claude-agent-acp'
] as const satisfies readonly ProviderType[]

export function isHarnessProviderType(type: ProviderType): boolean {
  return type === 'acp' || type === 'codex-acp' || type === 'claude-agent-acp'
}

export function isModelProviderType(type: ProviderType): boolean {
  return !isHarnessProviderType(type)
}

export function getVisibleProviderTypeOptions(
  scope: 'models' | 'acp',
  currentType?: ProviderType
): ProviderType[] {
  const manualProviderTypes: ProviderType[] =
    scope === 'acp' ? [...manualAcpProviderTypes] : [...manualModelProviderTypes]

  if (!currentType || manualProviderTypes.includes(currentType)) {
    return [...manualProviderTypes]
  }

  return [...manualProviderTypes, currentType]
}
