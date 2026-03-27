import { describe, expect, it, vi } from 'vitest'
import { resolveModel } from './model-resolver'

describe('resolveModel', () => {
  it('resolves openai chat models', () => {
    const chatModel = { id: 'chat-model' }
    const chatResolver = vi.fn(() => chatModel)
    const completionResolver = vi.fn(() => ({ id: 'completion-model' }))
    const openaiProvider = Object.assign(
      vi.fn(() => ({ id: 'base-model' })),
      {
        responses: vi.fn(() => ({ id: 'responses-model' })),
        chat: chatResolver,
        completion: completionResolver
      }
    )
    const factories = {
      openaiFactory: vi.fn(() => openaiProvider),
      openrouterFactory: vi.fn(),
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
    expect(chatResolver).toHaveBeenCalledWith('gpt-5')
  })

  it('resolves openai responses models', () => {
    const responsesModel = { id: 'responses-model' }
    const chatResolver = vi.fn(() => ({ id: 'chat-model' }))
    const completionResolver = vi.fn(() => ({ id: 'completion-model' }))
    const openaiProvider = Object.assign(
      vi.fn(() => ({ id: 'base-model' })),
      {
        responses: vi.fn(() => responsesModel),
        chat: chatResolver,
        completion: completionResolver
      }
    )
    const factories = {
      openaiFactory: vi.fn(() => openaiProvider),
      openrouterFactory: vi.fn(),
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

  it('resolves openrouter chat models in strict mode', () => {
    const chatModel = { id: 'openrouter-chat-model' }
    const openrouterProvider = Object.assign(
      vi.fn(() => chatModel),
      {
        languageModel: vi.fn(() => chatModel),
        chat: vi.fn(() => chatModel),
        completion: vi.fn(() => ({ id: 'openrouter-completion-model' }))
      }
    )
    const factories = {
      openaiFactory: vi.fn(),
      openrouterFactory: vi.fn(() => openrouterProvider),
      anthropicFactory: vi.fn(),
      googleFactory: vi.fn(),
      ollamaFactory: vi.fn()
    }

    const result = resolveModel(
      {
        type: 'openrouter',
        apiKey: 'test-openrouter-key',
        apiHost: 'https://openrouter.ai/api/v1',
        selectedModel: 'openai/gpt-4o'
      },
      factories
    )

    expect(result).toBe(chatModel)
    expect(factories.openrouterFactory).toHaveBeenCalledWith({
      apiKey: 'test-openrouter-key',
      baseURL: 'https://openrouter.ai/api/v1',
      compatibility: 'strict'
    })
    expect(openrouterProvider.chat).toHaveBeenCalledWith('openai/gpt-4o')
  })

  it('resolves gemini, anthropic and ollama models', () => {
    const googleProvider = vi.fn(() => ({ id: 'gemini-model' }))
    const anthropicProvider = vi.fn(() => ({ id: 'anthropic-model' }))
    const ollamaProvider = vi.fn(() => ({ id: 'ollama-model' }))
    const factories = {
      openaiFactory: vi.fn(),
      openrouterFactory: vi.fn(),
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

  it('resolves codex-acp models with the workspace cwd', () => {
    const languageModel = { id: 'codex-acp-model' }
    const provider = {
      languageModel: vi.fn(() => languageModel)
    }
    const factories = {
      acpProviderFactory: vi.fn(() => provider)
    }

    const result = resolveModel(
      {
        type: 'codex-acp',
        apiKey: '',
        selectedModel: 'default'
      },
      factories,
      {
        acpWorkingDirectory: '/tmp/project',
        acpHomeDirectory: '/tmp/acp-home'
      }
    )

    expect(result).toBe(languageModel)
    expect(factories.acpProviderFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'codex-acp',
        env: expect.objectContaining({
          CODEX_HOME: '/tmp/acp-home'
        }),
        persistSession: true,
        session: {
          cwd: '/tmp/project',
          mcpServers: []
        }
      })
    )
    expect(provider.languageModel).toHaveBeenCalledWith(undefined)
  })

  it('passes selected models through to claude-agent-acp', () => {
    const languageModel = { id: 'claude-agent-acp-model' }
    const provider = {
      languageModel: vi.fn(() => languageModel)
    }
    const factories = {
      acpProviderFactory: vi.fn(() => provider)
    }

    const result = resolveModel(
      {
        type: 'claude-agent-acp',
        apiKey: '',
        selectedModel: 'claude-sonnet-4-5'
      },
      factories
    )

    expect(result).toBe(languageModel)
    expect(provider.languageModel).toHaveBeenCalledWith('claude-sonnet-4-5')
  })
})
