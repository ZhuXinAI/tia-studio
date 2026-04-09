import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createACPProvider, type ACPProviderSettings } from '@mcpc-tech/acp-ai-provider'
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
  acpProviderFactory: (options: ACPProviderSettings) => {
    languageModel: (modelId?: string, modeId?: string) => unknown
  }
}

export type ResolveModelOptions = {
  acpWorkingDirectory?: string | null
  acpHomeDirectory?: string | null
}

export type ResolvedModel = MastraLanguageModel | MastraLegacyLanguageModel

const defaultFactories: ModelResolverFactories = {
  openaiFactory: createOpenAI,
  openrouterFactory: createOpenRouter,
  anthropicFactory: createAnthropic,
  googleFactory: createGoogleGenerativeAI,
  ollamaFactory: createOllama,
  acpProviderFactory: createACPProvider
}

function toStringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

function toACPModelId(selectedModel: string): string | undefined {
  const normalized = selectedModel.trim()
  if (normalized.length === 0 || normalized === 'default') {
    return undefined
  }

  return normalized
}

function parseLocalAcpCommand(apiHost: string | null | undefined): string | null {
  const normalizedHost = apiHost?.trim()
  if (!normalizedHost || !normalizedHost.startsWith('acp://')) {
    return null
  }

  const encodedCommand = normalizedHost.slice('acp://'.length).trim()
  return encodedCommand.length > 0 ? decodeURIComponent(encodedCommand) : null
}

function buildACPEnvironment(
  providerKey: string,
  options: ResolveModelOptions
): Record<string, string> {
  const env = toStringEnv(process.env)
  const acpHomeDirectory = options.acpHomeDirectory?.trim()

  if ((providerKey === 'codex' || providerKey === 'codex-acp') && acpHomeDirectory) {
    env.CODEX_HOME = bootstrapCodexHome(acpHomeDirectory)
  }

  return env
}

function resolveSourceCodexHome(): string {
  const configuredHome = process.env.CODEX_HOME?.trim()
  if (configuredHome) {
    return path.resolve(configuredHome)
  }

  return path.join(os.homedir(), '.codex')
}

function bootstrapCodexHome(acpHomeDirectory: string): string {
  const resolvedHome = path.resolve(acpHomeDirectory)
  mkdirSync(resolvedHome, { recursive: true })

  const sourceHome = resolveSourceCodexHome()
  if (sourceHome === resolvedHome) {
    return resolvedHome
  }

  for (const fileName of ['config.toml', 'auth.json']) {
    const sourcePath = path.join(sourceHome, fileName)
    if (!existsSync(sourcePath)) {
      continue
    }

    copyFileSync(sourcePath, path.join(resolvedHome, fileName))
  }

  return resolvedHome
}

function toExposedACPModelId(providerType: string, selectedModel: string): string {
  const resolvedModelId = toACPModelId(selectedModel)
  return resolvedModelId ?? `${providerType}/default`
}

function wrapACPModelMetadata<T extends object>(
  model: T,
  providerType: string,
  selectedModel: string
): T {
  const exposedModelId = toExposedACPModelId(providerType, selectedModel)

  return new Proxy(model, {
    get(target, property) {
      if (property === 'provider') {
        return providerType
      }

      if (property === 'modelId') {
        return exposedModelId
      }

      const value = Reflect.get(target, property, target)
      if (typeof value === 'function') {
        return value.bind(target)
      }

      return value
    }
  })
}

export function resolveModel(
  provider: ProviderModelConfig,
  factories: Partial<ModelResolverFactories> = {},
  options: ResolveModelOptions = {}
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

  if (provider.type === 'acp') {
    const localCommand = parseLocalAcpCommand(provider.apiHost)
    if (!localCommand) {
      throw new Error('ACP provider is missing a local command reference')
    }

    const acpProvider = mergedFactories.acpProviderFactory({
      command: localCommand,
      env: buildACPEnvironment(localCommand, options),
      session: {
        cwd: options.acpWorkingDirectory?.trim() || process.cwd(),
        mcpServers: []
      },
      persistSession: true
    })

    const model = acpProvider.languageModel(toACPModelId(provider.selectedModel)) as object

    return wrapACPModelMetadata(
      model,
      localCommand,
      provider.selectedModel
    ) as unknown as ResolvedModel
  }

  if (provider.type === 'codex-acp' || provider.type === 'claude-agent-acp') {
    const acpProvider = mergedFactories.acpProviderFactory({
      command: provider.type,
      env: buildACPEnvironment(provider.type, options),
      session: {
        cwd: options.acpWorkingDirectory?.trim() || process.cwd(),
        mcpServers: []
      },
      persistSession: true
    })

    const model = acpProvider.languageModel(toACPModelId(provider.selectedModel)) as object

    return wrapACPModelMetadata(
      model,
      provider.type,
      provider.selectedModel
    ) as unknown as ResolvedModel
  }

  throw new Error(`Unsupported provider type: ${provider.type}`)
}
