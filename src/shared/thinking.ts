import type { AgentThinkingLevel } from './agent-runtime'

export const AGENT_THINKING_STRENGTHS = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
] as const

export type AgentThinkingStrength = (typeof AGENT_THINKING_STRENGTHS)[number]

export const DEFAULT_AGENT_THINKING_STRENGTHS: AgentThinkingStrength[] = [
  ...AGENT_THINKING_STRENGTHS
]

export function defaultThinkingStrengthsForModel(modelId: string): AgentThinkingStrength[] {
  if (modelId.toLowerCase().includes('deepseek-v4')) {
    return ['high', 'xhigh', 'max']
  }

  return [...DEFAULT_AGENT_THINKING_STRENGTHS]
}

export function defaultThinkingLevelForModel(modelId: string): AgentThinkingLevel {
  return modelId.toLowerCase().includes('deepseek-v4') ? 'high' : 'medium'
}

export function normalizeThinkingLevelForProvider(input: {
  modelId: string
  supportsThinking: boolean
  thinkingOnly: boolean
  allowsThinkingOff: boolean
  defaultThinkingLevel: AgentThinkingLevel
  supportedThinkingLevels: readonly AgentThinkingStrength[]
  preferred?: AgentThinkingLevel
}): AgentThinkingLevel {
  if (!input.supportsThinking) return 'off'

  const supportsOff = !input.thinkingOnly && input.allowsThinkingOff
  const supported = new Set(input.supportedThinkingLevels)
  const preferred = input.preferred
  if (preferred === 'off' && supportsOff) return 'off'
  if (preferred && preferred !== 'off' && supported.has(preferred)) return preferred

  const defaultLevel = input.defaultThinkingLevel
  if (defaultLevel !== 'off' && supported.has(defaultLevel)) return defaultLevel

  const modelDefault = defaultThinkingLevelForModel(input.modelId)
  if (modelDefault !== 'off' && supported.has(modelDefault)) return modelDefault
  if (supportsOff) return 'off'
  return input.supportedThinkingLevels[0] ?? 'off'
}
