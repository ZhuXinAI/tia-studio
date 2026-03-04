import { describe, expect, it, vi } from 'vitest'
import { resolveModel } from './model-resolver'

describe('resolveModel', () => {
  it('resolves openai chat models', () => {
    const chatModel = { id: 'chat-model' }
    const openaiProvider = Object.assign(
      vi.fn(() => chatModel),
      {
        responses: vi.fn(() => ({ id: 'responses-model' }))
      }
    )
    const factories = {
      openaiFactory: vi.fn(() => openaiProvider),
      anthropicFactory: vi.fn(),
      googleFactory: vi.fn(),
      ollamaFactory: vi.fn()
    }

    const result = resolveModel(
      {
        type: 'openai',
        apiKey: 'test-openai-key',
        apiHost: 'https://api.openai.com/v1',
        selectedModel: 'gpt-5'
      },
      factories
    )

    expect(result).toBe(chatModel)
    expect(openaiProvider).toHaveBeenCalledWith('gpt-5')
  })

  it('resolves openai responses models', () => {
    const responsesModel = { id: 'responses-model' }
    const openaiProvider = Object.assign(
      vi.fn(() => ({ id: 'chat-model' })),
      {
        responses: vi.fn(() => responsesModel)
      }
    )
    const factories = {
      openaiFactory: vi.fn(() => openaiProvider),
      anthropicFactory: vi.fn(),
      googleFactory: vi.fn(),
      ollamaFactory: vi.fn()
    }

    const result = resolveModel(
      {
        type: 'openai-response',
        apiKey: 'test-openai-key',
        apiHost: 'https://api.openai.com/v1',
        selectedModel: 'gpt-5'
      },
      factories
    )

    expect(result).toBe(responsesModel)
    expect(openaiProvider.responses).toHaveBeenCalledWith('gpt-5')
  })

  it('resolves gemini, anthropic and ollama models', () => {
    const googleProvider = vi.fn(() => ({ id: 'gemini-model' }))
    const anthropicProvider = vi.fn(() => ({ id: 'anthropic-model' }))
    const ollamaProvider = vi.fn(() => ({ id: 'ollama-model' }))
    const factories = {
      openaiFactory: vi.fn(),
      anthropicFactory: vi.fn(() => anthropicProvider),
      googleFactory: vi.fn(() => googleProvider),
      ollamaFactory: vi.fn(() => ollamaProvider)
    }

    const geminiResult = resolveModel(
      {
        type: 'gemini',
        apiKey: 'test-google-key',
        selectedModel: 'gemini-2.5-flash'
      },
      factories
    )
    const anthropicResult = resolveModel(
      {
        type: 'anthropic',
        apiKey: 'test-anthropic-key',
        selectedModel: 'claude-sonnet-4-5'
      },
      factories
    )
    const ollamaResult = resolveModel(
      {
        type: 'ollama',
        apiKey: '',
        apiHost: 'http://127.0.0.1:11434',
        selectedModel: 'qwen2.5:7b'
      },
      factories
    )

    expect(geminiResult).toEqual({ id: 'gemini-model' })
    expect(anthropicResult).toEqual({ id: 'anthropic-model' })
    expect(ollamaResult).toEqual({ id: 'ollama-model' })
  })
})
