import type { LanguageModel } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import type { AppAssistant } from '../persistence/repos/assistants-repo'
import type { AppProvider } from '../persistence/repos/providers-repo'
import { createLlmInterruptionDecider } from './llm-interruption-decider'

describe('createLlmInterruptionDecider', () => {
  it('uses the assistant provider model and localizes the acknowledgement from the model output', async () => {
    const model = { id: 'mock-model' } as unknown as LanguageModel
    const assistant: AppAssistant = {
      id: 'assistant-1',
      name: 'Support Assistant',
      description: '',
      instructions: '',
      enabled: true,
      origin: 'tia',
      studioFeaturesEnabled: true,
      providerId: 'provider-1',
      workspaceConfig: {},
      skillsConfig: {},
      mcpConfig: {},
      maxSteps: 20,
      memoryConfig: null,
      createdAt: '2026-03-12T00:00:00.000Z',
      updatedAt: '2026-03-12T00:00:00.000Z'
    }
    const provider: AppProvider = {
      id: 'provider-1',
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'test-key',
      apiHost: null,
      selectedModel: 'gpt-5',
      providerModels: null,
      enabled: true,
      supportsVision: false,
      isBuiltIn: false,
      icon: null,
      officialSite: null,
      createdAt: '2026-03-12T00:00:00.000Z',
      updatedAt: '2026-03-12T00:00:00.000Z'
    }
    const assistantsRepo = {
      getById: vi.fn(async () => assistant)
    }
    const providersRepo = {
      getById: vi.fn(async () => provider)
    }
    const resolveAssistantModel = vi.fn(() => model)
    const generateInterruptionDecision = vi.fn(async () => ({
      object: {
        decision: 'queue' as const,
        replyLocale: 'zh-CN' as const
      }
    }))

    const decider = createLlmInterruptionDecider({
      assistantsRepo,
      providersRepo,
      resolveAssistantModel,
      generateInterruptionDecision
    })

    const result = await decider({
      assistantId: 'assistant-1',
      activeTaskSummary: 'Drafting the current answer',
      incomingMessage: '顺便也补充一下价格',
      queuedMessageCount: 1,
      replyLocaleHint: 'en-US'
    })

    expect(resolveAssistantModel).toHaveBeenCalledWith({
      type: 'openai',
      apiKey: 'test-key',
      apiHost: null,
      selectedModel: 'gpt-5'
    })
    expect(generateInterruptionDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        temperature: 0,
        prompt: expect.stringContaining("User's last prompt:\n顺便也补充一下价格")
      })
    )
    expect(generateInterruptionDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Preferred acknowledgement locale: en-US')
      })
    )
    expect(result).toEqual({
      decision: 'queue',
      reason: '好的，我会在当前回复结束后立刻处理这条消息。'
    })
  })

  it('short-circuits empty prompts without calling the model', async () => {
    const generateInterruptionDecision = vi.fn()
    const decider = createLlmInterruptionDecider({
      assistantsRepo: {
        getById: vi.fn(async () => null)
      },
      providersRepo: {
        getById: vi.fn(async () => null)
      },
      generateInterruptionDecision
    })

    const result = await decider({
      assistantId: 'assistant-1',
      activeTaskSummary: 'Working on a reply',
      incomingMessage: '   ',
      queuedMessageCount: 0,
      replyLocaleHint: 'fr'
    })

    expect(generateInterruptionDecision).not.toHaveBeenCalled()
    expect(result).toEqual({
      decision: 'queue',
      reason: 'Compris, je m’en occupe juste après la réponse en cours.'
    })
  })
})
