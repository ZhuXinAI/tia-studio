import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { MastraLanguageModel, MastraLegacyLanguageModel } from '@mastra/core/agent'
import { createOllama } from 'ollama-ai-provider'

export type ProviderModelConfig = {
  type: string
  apiKey: string
  apiHost?: string | null
  selectedModel: string
}

export type ModelResolverFactories = {
  openaiFactory: (options?: { apiKey?: string; baseURL?: string }) => {
    (modelId: string): unknown
    responses: (modelId: string) => unknown
    chat: (modelId: string) => unknown
    completion: (modelId: string) => unknown
  }
  openrouterFactory: (options?: {
    apiKey?: string
    baseURL?: string
    compatibility?: 'strict' | 'compatible'
  }) => {
    (modelId: string): unknown
    languageModel: (modelId: string) => unknown
    chat: (modelId: string) => unknown
    completion: (modelId: string) => unknown
  }
  anthropicFactory: (options?: {
    apiKey?: string
    baseURL?: string
  }) => (modelId: string) => unknown
  googleFactory: (options?: { apiKey?: string; baseURL?: string }) => (modelId: string) => unknown
  ollamaFactory: (options?: { baseURL?: string }) => (modelId: string) => unknown
}

export type ResolvedModel = MastraLanguageModel | MastraLegacyLanguageModel

const defaultFactories: ModelResolverFactories = {
  openaiFactory: createOpenAI,
  openrouterFactory: createOpenRouter,
  anthropicFactory: createAnthropic,
  googleFactory: createGoogleGenerativeAI,
  ollamaFactory: createOllama
}

export function resolveModel(
  provider: ProviderModelConfig,
  factories: Partial<ModelResolverFactories> = {}
): ResolvedModel {
  const mergedFactories = {
    ...defaultFactories,
    ...factories
  }

  if (provider.type === 'openai') {
    const openaiProvider = mergedFactories.openaiFactory({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost ?? undefined
    })

    return openaiProvider.chat(provider.selectedModel) as ResolvedModel
  }

  if (provider.type === 'openai-response') {
    const openaiProvider = mergedFactories.openaiFactory({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost ?? undefined
    })

    return openaiProvider.responses(provider.selectedModel) as ResolvedModel
  }

  if (provider.type === 'openrouter') {
    const openrouterProvider = mergedFactories.openrouterFactory({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost ?? undefined,
      compatibility: 'strict'
    })

    return openrouterProvider.chat(provider.selectedModel) as ResolvedModel
  }

  if (provider.type === 'gemini') {
    const googleProvider = mergedFactories.googleFactory({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost ?? undefined
    })

    return googleProvider(provider.selectedModel) as ResolvedModel
  }

  if (provider.type === 'anthropic') {
    const anthropicProvider = mergedFactories.anthropicFactory({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost ?? undefined
    })

    return anthropicProvider(provider.selectedModel) as ResolvedModel
  }

  if (provider.type === 'ollama') {
    const ollamaProvider = mergedFactories.ollamaFactory({
      baseURL: provider.apiHost ?? undefined
    })

    return ollamaProvider(provider.selectedModel) as ResolvedModel
  }

  throw new Error(`Unsupported provider type: ${provider.type}`)
}
