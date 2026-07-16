import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppProvider } from '../../persistence/repos/providers-repo'

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

export async function writePiModelConfig(
  agentDir: string,
  provider: AppProvider
): Promise<{ piProvider: string }> {
  await mkdir(agentDir, { recursive: true })
  if (!provider.apiHost && provider.type !== 'ollama') {
    await writeFile(join(agentDir, 'models.json'), '{"providers":{}}\n', 'utf8')
    return { piProvider: builtInProvider(provider.type) }
  }

  const piProvider = `tia-${provider.id}`
  const model = {
    id: provider.selectedModel,
    name: provider.selectedModel,
    reasoning: true,
    input: provider.supportsVision ? ['text', 'image'] : ['text'],
    ...(provider.selectedModelContextWindowTokens
      ? { contextWindow: provider.selectedModelContextWindowTokens }
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
