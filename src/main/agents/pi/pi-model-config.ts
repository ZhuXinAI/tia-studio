import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppProvider } from '../../persistence/repos/providers-repo'
import { AGENT_THINKING_STRENGTHS, type AgentThinkingStrength } from '../../../shared/thinking'

function builtInProvider(type: string): string {
  if (type === 'gemini') return 'google'
  if (type === 'openai-response') return 'openai'
  return type
}

function apiForProvider(type: string): string {
  if (type === 'anthropic') return 'anthropic-messages'
  if (type === 'gemini' || type === 'google') return 'google-generative-ai'
  if (type === 'openai-response') return 'openai-responses'
  return 'openai-completions'
}

function apiKeyEnvironment(type: string): string {
  if (type === 'anthropic') return 'ANTHROPIC_API_KEY'
  if (type === 'gemini' || type === 'google') return 'GEMINI_API_KEY'
  if (type === 'openrouter') return 'OPENROUTER_API_KEY'
  if (type === 'ollama') return 'OLLAMA_API_KEY'
  return 'OPENAI_API_KEY'
}

function modelCompat(provider: AppProvider): Record<string, unknown> | undefined {
  const modelId = provider.selectedModel.toLowerCase()
  const isDeepSeekModel = provider.type === 'openai' && modelId.includes('deepseek')
  if (!isDeepSeekModel) return undefined
  const isDeepSeekV4 = modelId.includes('deepseek-v4')

  // Custom gateways do not get Pi's DeepSeek URL detection. Keep this aligned
  // with Pi's built-in DeepSeek compatibility, including the V4 token field.
  return {
    supportsStore: false,
    thinkingFormat: 'deepseek',
    supportsDeveloperRole: false,
    requiresReasoningContentOnAssistantMessages: true,
    ...(isDeepSeekV4 ? { maxTokensField: 'max_tokens' } : {})
  }
}

function providerThinkingValue(provider: AppProvider, level: AgentThinkingStrength): string {
  const modelId = provider.selectedModel.toLowerCase()
  if (provider.type === 'openai' && modelId.includes('deepseek-v4')) {
    if (level === 'high') return 'high'
    if (level === 'xhigh' || level === 'max') return 'max'
  }

  return level
}

function modelThinkingLevelMap(provider: AppProvider): Record<string, string | null> | undefined {
  if (!provider.supportsThinking) return undefined

  const supported = new Set(provider.supportedThinkingLevels)
  const map: Record<string, string | null> = {}
  if (provider.thinkingOnly || !provider.allowsThinkingOff) {
    map.off = null
  }
  for (const level of AGENT_THINKING_STRENGTHS) {
    map[level] = supported.has(level) ? providerThinkingValue(provider, level) : null
  }

  return map
}

function modelThinkingConfig(provider: AppProvider): Record<string, unknown> {
  const thinkingLevelMap = modelThinkingLevelMap(provider)
  return {
    reasoning: provider.supportsThinking,
    ...(thinkingLevelMap ? { thinkingLevelMap } : {})
  }
}

export async function writePiModelConfig(
  agentDir: string,
  provider: AppProvider
): Promise<{ piProvider: string }> {
  await mkdir(agentDir, { recursive: true })
  if (!provider.apiHost && provider.type !== 'ollama') {
    const config = {
      providers: {
        [builtInProvider(provider.type)]: {
          modelOverrides: {
            [provider.selectedModel]: modelThinkingConfig(provider)
          }
        }
      }
    }
    await writeFile(join(agentDir, 'models.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    return { piProvider: builtInProvider(provider.type) }
  }

  const piProvider = `tia-${provider.id}`
  const model = {
    id: provider.selectedModel,
    name: provider.selectedModel,
    ...modelThinkingConfig(provider),
    input: provider.supportsVision ? ['text', 'image'] : ['text'],
    ...(provider.selectedModelContextWindowTokens
      ? { contextWindow: provider.selectedModelContextWindowTokens }
      : {}),
    ...(modelCompat(provider) ? { compat: modelCompat(provider) } : {}),
    ...(modelThinkingLevelMap(provider)
      ? { thinkingLevelMap: modelThinkingLevelMap(provider) }
      : {})
  }
  const config = {
    providers: {
      [piProvider]: {
        baseUrl: provider.apiHost ?? 'http://localhost:11434/v1',
        api: apiForProvider(provider.type),
        apiKey: apiKeyEnvironment(provider.type),
        authHeader: provider.type !== 'ollama',
        models: [model]
      }
    }
  }
  await writeFile(join(agentDir, 'models.json'), `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })
  return { piProvider }
}
