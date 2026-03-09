import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
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
  anthropicFactory: (options?: {
    apiKey?: string
    baseURL?: string
  }) => (modelId: string) => unknown
  googleFactory: (options?: { apiKey?: string; baseURL?: string }) => (modelId: string) => unknown
  ollamaFactory: (options?: { baseURL?: string }) => (modelId: string) => unknown
}

const defaultFactories: ModelResolverFactories = {
  openaiFactory: createOpenAI,
  anthropicFactory: createAnthropic,
  googleFactory: createGoogleGenerativeAI,
  ollamaFactory: createOllama
}

export function resolveModel(
  provider: ProviderModelConfig,
  factories: Partial<ModelResolverFactories> = {}
): MastraLanguageModel | MastraLegacyLanguageModel {
  const mergedFactories = {
    ...defaultFactories,
    ...factories
  }

  if (provider.type === 'openai') {
    const openaiProvider = mergedFactories.openaiFactory({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost ?? undefined
    })

    return openaiProvider.chat(provider.selectedModel) as
      | MastraLanguageModel
      | MastraLegacyLanguageModel
  }

  if (provider.type === 'openai-response') {
    const openaiProvider = mergedFactories.openaiFactory({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost ?? undefined
    })

    return openaiProvider.responses(provider.selectedModel) as
      | MastraLanguageModel
      | MastraLegacyLanguageModel
  }

  if (provider.type === 'gemini') {
    const googleProvider = mergedFactories.googleFactory({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost ?? undefined
    })

    return googleProvider(provider.selectedModel) as MastraLanguageModel | MastraLegacyLanguageModel
  }

  if (provider.type === 'anthropic') {
    const anthropicProvider = mergedFactories.anthropicFactory({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost ?? undefined
    })

    return anthropicProvider(provider.selectedModel) as
      | MastraLanguageModel
      | MastraLegacyLanguageModel
  }

  if (provider.type === 'ollama') {
    const ollamaProvider = mergedFactories.ollamaFactory({
      baseURL: provider.apiHost ?? undefined
    })

    return ollamaProvider(provider.selectedModel) as MastraLanguageModel | MastraLegacyLanguageModel
  }

  throw new Error(`Unsupported provider type: ${provider.type}`)
}
