import { Agent } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core/mastra'
import { handleChatStream } from '@mastra/ai-sdk'
import type { UIMessage } from 'ai'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import { ChatRouteError } from '../server/chat/chat-errors'
import { resolveModel } from './model-resolver'

type StreamChatParams = {
  assistantId: string
  messages: UIMessage[]
  threadId: string
  profileId: string
  trigger?: 'submit-message' | 'regenerate-message'
}

export type AssistantRuntime = {
  streamChat: (params: StreamChatParams) => Promise<ReadableStream<unknown>>
}

type AssistantRuntimeServiceOptions = {
  mastra: Mastra
  assistantsRepo: AssistantsRepository
  providersRepo: ProvidersRepository
}

export class AssistantRuntimeService implements AssistantRuntime {
  private readonly registeredAgentKeys = new Set<string>()

  constructor(private readonly options: AssistantRuntimeServiceOptions) {}

  async streamChat(params: StreamChatParams): Promise<ReadableStream<unknown>> {
    const { assistant } = await this.getAssistantContext(params.assistantId)
    await this.ensureAgentRegistered(assistant.id)

    const stream = await handleChatStream({
      mastra: this.options.mastra,
      agentId: assistant.id,
      params: {
        messages: params.messages,
        trigger: params.trigger,
        memory: {
          thread: params.threadId,
          resource: params.profileId
        }
      },
      sendReasoning: true
    })

    return stream as ReadableStream<unknown>
  }

  private async getAssistantContext(assistantId: string) {
    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      throw new ChatRouteError(404, 'assistant_not_found', 'Assistant not found')
    }

    const provider = await this.options.providersRepo.getById(assistant.providerId)
    if (!provider) {
      throw new ChatRouteError(409, 'provider_not_found', 'Assistant provider is not configured')
    }

    if (!provider.enabled) {
      throw new ChatRouteError(409, 'provider_disabled', 'Assistant provider is disabled')
    }

    if (!provider.selectedModel) {
      throw new ChatRouteError(409, 'provider_model_missing', 'Assistant provider model is missing')
    }

    if (Object.keys(assistant.workspaceConfig ?? {}).length === 0) {
      throw new ChatRouteError(
        409,
        'assistant_not_ready',
        'Assistant workspace is not configured'
      )
    }

    return { assistant, provider }
  }

  private async ensureAgentRegistered(assistantId: string): Promise<void> {
    if (this.registeredAgentKeys.has(assistantId)) {
      return
    }

    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      throw new ChatRouteError(404, 'assistant_not_found', 'Assistant not found')
    }

    const provider = await this.options.providersRepo.getById(assistant.providerId)
    if (!provider) {
      throw new ChatRouteError(409, 'provider_not_found', 'Assistant provider is not configured')
    }

    const agent = new Agent({
      id: assistant.id,
      name: assistant.name,
      instructions: assistant.instructions || 'You are a helpful assistant.',
      model: resolveModel({
        type: provider.type,
        apiKey: provider.apiKey,
        apiHost: provider.apiHost,
        selectedModel: provider.selectedModel
      }) as any
    })

    this.options.mastra.addAgent(agent, assistant.id)
    this.registeredAgentKeys.add(assistant.id)
  }
}
