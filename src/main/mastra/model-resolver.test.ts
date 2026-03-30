import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
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
    const acpWorkingDirectory = '/tmp/project'
    const acpHomeDirectory = '/tmp/acp-home'
    const languageModel = {
      specificationVersion: 'v3' as const,
      provider: 'acp',
      modelId: undefined,
      supportedUrls: {},
      doGenerate: vi.fn(),
      doStream: vi.fn()
    }
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
        acpWorkingDirectory,
        acpHomeDirectory
      }
    )

    expect(result).toMatchObject({
      specificationVersion: 'v3',
      provider: 'codex-acp',
      modelId: 'codex-acp/default'
    })
    expect(factories.acpProviderFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'codex-acp',
        env: expect.objectContaining({
          CODEX_HOME: path.resolve(acpHomeDirectory)
        }),
        persistSession: true,
        session: {
          cwd: acpWorkingDirectory,
          mcpServers: []
        }
      })
    )
    expect(provider.languageModel).toHaveBeenCalledWith(undefined)
  })

  it('creates and bootstraps isolated CODEX_HOME directories for codex-acp', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tia-codex-home-'))
    const sourceHome = path.join(tempRoot, 'source-home')
    const isolatedHome = path.join(tempRoot, 'isolated-home')
    await mkdir(sourceHome, { recursive: true })
    await writeFile(path.join(sourceHome, 'config.toml'), 'model = "gpt-5.4"\n', 'utf8')
    await writeFile(path.join(sourceHome, 'auth.json'), '{"token":"test"}\n', 'utf8')

    const previousCodexHome = process.env.CODEX_HOME
    process.env.CODEX_HOME = sourceHome

    try {
      const languageModel = {
        specificationVersion: 'v3' as const,
        provider: 'acp',
        modelId: undefined,
        supportedUrls: {},
        doGenerate: vi.fn(),
        doStream: vi.fn()
      }
      const provider = {
        languageModel: vi.fn(() => languageModel)
      }
      const factories = {
        acpProviderFactory: vi.fn(() => provider)
      }

      resolveModel(
        {
          type: 'codex-acp',
          apiKey: '',
          selectedModel: 'default'
        },
        factories,
        {
          acpHomeDirectory: isolatedHome
        }
      )

      const copiedConfig = await readFile(path.join(isolatedHome, 'config.toml'), 'utf8')
      const copiedAuth = await readFile(path.join(isolatedHome, 'auth.json'), 'utf8')

      expect(copiedConfig).toContain('model = "gpt-5.4"')
      expect(copiedAuth).toContain('"token":"test"')
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previousCodexHome
      }

      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('passes selected models through to claude-agent-acp', () => {
    const languageModel = {
      specificationVersion: 'v3' as const,
      provider: 'acp',
      modelId: 'claude-sonnet-4-5',
      supportedUrls: {},
      doGenerate: vi.fn(),
      doStream: vi.fn()
    }
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

    expect(result).toMatchObject({
      specificationVersion: 'v3',
      provider: 'claude-agent-acp',
      modelId: 'claude-sonnet-4-5'
    })
    expect(provider.languageModel).toHaveBeenCalledWith('claude-sonnet-4-5')
  })
})
