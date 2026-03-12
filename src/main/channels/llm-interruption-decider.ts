import { generateObject, type LanguageModel } from 'ai'
import { z } from 'zod'
import { resolveModel, type ProviderModelConfig } from '../mastra/model-resolver'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import { supportedUiLanguages, type UiLanguage } from '../ui-config'
import { formatChannelInterruptionReply } from './channel-progress-messages'
import type { InterruptionDecision, InterruptionDecisionInput } from './channel-message-router'

const interruptionDecisionSchema = z.object({
  decision: z.enum(['interrupt', 'queue']),
  replyLocale: z.enum(supportedUiLanguages)
})

type InterruptionDecisionObject = z.infer<typeof interruptionDecisionSchema>

type GenerateInterruptionDecisionOptions = {
  model: LanguageModel
  prompt: string
  system: string
  schema: typeof interruptionDecisionSchema
  temperature: number
}

type GenerateInterruptionDecisionResult = {
  object: InterruptionDecisionObject
}

type GenerateInterruptionDecision = (
  options: GenerateInterruptionDecisionOptions
) => Promise<GenerateInterruptionDecisionResult>

type ResolveAssistantModel = (provider: ProviderModelConfig) => LanguageModel

type LlmInterruptionDeciderOptions = {
  assistantsRepo: Pick<AssistantsRepository, 'getById'>
  providersRepo: Pick<ProvidersRepository, 'getById'>
  generateInterruptionDecision?: GenerateInterruptionDecision
  resolveAssistantModel?: ResolveAssistantModel
}

const DEFAULT_REPLY_LOCALE: UiLanguage = 'en-US'
const MAX_PROMPT_CONTEXT_LENGTH = 1_200

const defaultGenerateInterruptionDecision: GenerateInterruptionDecision = async (options) => {
  const { object } = await generateObject(options)
  return { object }
}

const defaultResolveAssistantModel: ResolveAssistantModel = (provider) => {
  return resolveModel(provider) as unknown as LanguageModel
}

function truncatePromptContext(value: string): string {
  const normalized = value.trim()
  if (normalized.length <= MAX_PROMPT_CONTEXT_LENGTH) {
    return normalized
  }

  return `${normalized.slice(0, MAX_PROMPT_CONTEXT_LENGTH - 1).trimEnd()}…`
}

function buildInterruptionPrompt(input: InterruptionDecisionInput): string {
  const activeTaskSummary = truncatePromptContext(input.activeTaskSummary)
  const latestPrompt = truncatePromptContext(input.incomingMessage)
  const replyLocaleHint = input.replyLocaleHint?.trim() || DEFAULT_REPLY_LOCALE

  return [
    'Active reply summary:',
    activeTaskSummary || '(empty)',
    '',
    "User's last prompt:",
    latestPrompt || '(empty)',
    '',
    `Queued follow-up count: ${input.queuedMessageCount}`,
    `Preferred acknowledgement locale: ${replyLocaleHint}`,
    `Supported reply locales: ${supportedUiLanguages.join(', ')}`,
    '',
    'Choose "interrupt" only when the user clearly wants to stop, cancel, switch priorities, or handle something more urgent right now.',
    'Choose "queue" for normal follow-ups, extra details, or requests that can wait until the current reply finishes.',
    'Set replyLocale to the supported locale that the acknowledgement should be returned in.',
    'Prefer the provided locale hint unless the latest user prompt clearly indicates another supported language.'
  ].join('\n')
}

async function resolveConfiguredAssistantModel(
  assistantId: string,
  assistantsRepo: Pick<AssistantsRepository, 'getById'>,
  providersRepo: Pick<ProvidersRepository, 'getById'>,
  resolveAssistantModel: ResolveAssistantModel
): Promise<LanguageModel> {
  const assistant = await assistantsRepo.getById(assistantId)
  if (!assistant) {
    throw new Error(`Assistant "${assistantId}" was not found`)
  }

  if (!assistant.providerId) {
    throw new Error(`Assistant "${assistantId}" does not have a configured provider`)
  }

  const provider = await providersRepo.getById(assistant.providerId)
  if (!provider) {
    throw new Error(`Provider "${assistant.providerId}" was not found`)
  }

  if (!provider.enabled) {
    throw new Error(`Provider "${assistant.providerId}" is disabled`)
  }

  if (!provider.selectedModel.trim()) {
    throw new Error(`Provider "${assistant.providerId}" does not have a selected model`)
  }

  return resolveAssistantModel({
    type: provider.type,
    apiKey: provider.apiKey,
    apiHost: provider.apiHost,
    selectedModel: provider.selectedModel
  })
}

export function createLlmInterruptionDecider(
  options: LlmInterruptionDeciderOptions
): (input: InterruptionDecisionInput) => Promise<InterruptionDecision> {
  const generateInterruptionDecision =
    options.generateInterruptionDecision ?? defaultGenerateInterruptionDecision
  const resolveAssistantModel = options.resolveAssistantModel ?? defaultResolveAssistantModel

  return async (input) => {
    if (input.incomingMessage.trim().length === 0) {
      return {
        decision: 'queue',
        reason: formatChannelInterruptionReply('queue', input.replyLocaleHint)
      }
    }

    const model = await resolveConfiguredAssistantModel(
      input.assistantId,
      options.assistantsRepo,
      options.providersRepo,
      resolveAssistantModel
    )

    const { object } = await generateInterruptionDecision({
      model,
      system:
        'You decide how a live chat assistant should handle a newly arrived user message while it is already replying.',
      prompt: buildInterruptionPrompt(input),
      schema: interruptionDecisionSchema,
      temperature: 0
    })

    return {
      decision: object.decision,
      reason: formatChannelInterruptionReply(object.decision, object.replyLocale)
    }
  }
}
