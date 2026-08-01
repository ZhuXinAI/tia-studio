import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { AppProvider } from '../../persistence/repos/providers-repo'
import { writePiModelConfig } from './pi-model-config'

function deepSeekProvider(): AppProvider {
  return {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai',
    apiKey: 'test-key',
    apiHost: 'https://opencode.ai/zen/go/v1',
    selectedModel: 'deepseek-v4-flash',
    selectedModelContextWindowTokens: null,
    providerModels: null,
    enabled: true,
    supportsVision: false,
    supportsThinking: true,
    thinkingOnly: false,
    allowsThinkingOff: true,
    defaultThinkingLevel: 'high',
    supportedThinkingLevels: ['high', 'xhigh', 'max'],
    isBuiltIn: false,
    isAdded: true,
    isDefault: false,
    icon: null,
    officialSite: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z'
  }
}

describe('writePiModelConfig', () => {
  it('writes DeepSeek V4 compatibility and maps xhigh to max', async () => {
    const agentDir = await mkdtemp(join(tmpdir(), 'tia-studio-model-config-'))

    try {
      await writePiModelConfig(agentDir, deepSeekProvider())
      const config = JSON.parse(await readFile(join(agentDir, 'models.json'), 'utf8')) as {
        providers: Record<string, { models: Array<Record<string, unknown>> }>
      }
      const model = config.providers['tia-deepseek']?.models[0]

      expect(model).toMatchObject({
        reasoning: true,
        compat: {
          supportsStore: false,
          thinkingFormat: 'deepseek',
          supportsDeveloperRole: false,
          requiresReasoningContentOnAssistantMessages: true,
          maxTokensField: 'max_tokens'
        },
        thinkingLevelMap: {
          minimal: null,
          low: null,
          medium: null,
          high: 'high',
          xhigh: 'max',
          max: 'max'
        }
      })
    } finally {
      await rm(agentDir, { recursive: true, force: true })
    }
  })
})
