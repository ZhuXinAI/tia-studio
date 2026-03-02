import { Agent } from '@mastra/core/agent'
import { MockMemory } from '@mastra/core/memory'
import type { Mastra } from '@mastra/core/mastra'
import type { InMemoryStore } from '@mastra/core/storage'
import { handleChatStream } from '@mastra/ai-sdk'
import type { UIMessage } from 'ai'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { ProvidersRepository } from '../persistence/repos/providers-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import { ChatRouteError } from '../server/chat/chat-errors'
import { resolveModel } from './model-resolver'
import { browserSearchTool } from './tools/browser-search-tool'

type StreamChatParams = {
  assistantId: string
  messages: UIMessage[]
  threadId: string
  profileId: string
  trigger?: 'submit-message' | 'regenerate-message'
}

type ListThreadMessagesParams = {
  assistantId: string
  threadId: string
  profileId: string
}

type AssistantContext = {
  assistant: NonNullable<Awaited<ReturnType<AssistantsRepository['getById']>>>
  provider: NonNullable<Awaited<ReturnType<ProvidersRepository['getById']>>>
}

type PersistedMessagePart = {
  type?: unknown
  text?: unknown
  reasoning?: unknown
  content?: unknown
  value?: unknown
}

export type AssistantRuntime = {
  streamChat: (params: StreamChatParams) => Promise<ReadableStream<unknown>>
  listThreadMessages: (params: ListThreadMessagesParams) => Promise<UIMessage[]>
}

type AssistantRuntimeServiceOptions = {
  mastra: Mastra
  assistantsRepo: AssistantsRepository
  providersRepo: ProvidersRepository
  threadsRepo: ThreadsRepository
}

export class AssistantRuntimeService implements AssistantRuntime {
  private readonly registeredAgentSignatures = new Map<string, string>()

  constructor(private readonly options: AssistantRuntimeServiceOptions) {}

  async streamChat(params: StreamChatParams): Promise<ReadableStream<unknown>> {
    const { assistant, provider } = await this.getAssistantContext(params.assistantId)
    await this.assertThreadBelongsToAssistant({
      assistantId: params.assistantId,
      threadId: params.threadId,
      profileId: params.profileId
    })
    await this.ensureAgentRegistered(assistant, provider)

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

  async listThreadMessages(params: ListThreadMessagesParams): Promise<UIMessage[]> {
    await this.assertAssistantExists(params.assistantId)
    await this.assertThreadBelongsToAssistant(params)

    const storage = this.options.mastra.getStorage()
    if (!storage) {
      return []
    }

    const memoryStore = await storage.getStore('memory')
    if (!memoryStore) {
      return []
    }

    const { messages } = await memoryStore.listMessages({
      threadId: params.threadId,
      resourceId: params.profileId,
      perPage: false
    })

    return messages
      .filter((message) => message.role === 'assistant' || message.role === 'user')
      .map((message) => {
        const metadata = message.content.metadata
        const parts = Array.isArray(message.content.parts)
          ? message.content.parts.map((part) => this.normalizePersistedPart(part))
          : []
        return {
          id: message.id,
          role: message.role,
          parts: parts as UIMessage['parts'],
          ...(metadata ? { metadata } : {})
        } satisfies UIMessage
      })
  }

  private readPersistedPartText(part: PersistedMessagePart): string {
    if (typeof part.text === 'string') {
      return part.text
    }

    if (typeof part.reasoning === 'string') {
      return part.reasoning
    }

    if (typeof part.content === 'string') {
      return part.content
    }

    if (typeof part.value === 'string') {
      return part.value
    }

    return ''
  }

  private normalizePersistedPart(part: unknown): unknown {
    if (!part || typeof part !== 'object') {
      return part
    }

    const persistedPart = part as PersistedMessagePart
    if (persistedPart.type === 'text') {
      const { text, reasoning, content, value, ...rest } = persistedPart
      void text
      void reasoning
      void content
      void value
      return {
        ...rest,
        type: 'text',
        text: this.readPersistedPartText(persistedPart)
      }
    }

    if (persistedPart.type === 'reasoning') {
      const { text, reasoning, content, value, ...rest } = persistedPart
      void text
      void reasoning
      void content
      void value
      return {
        ...rest,
        type: 'reasoning',
        text: this.readPersistedPartText(persistedPart)
      }
    }

    return part
  }

  private async assertAssistantExists(assistantId: string): Promise<void> {
    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      throw new ChatRouteError(404, 'assistant_not_found', 'Assistant not found')
    }
  }

  private async assertThreadBelongsToAssistant(params: ListThreadMessagesParams): Promise<void> {
    const thread = await this.options.threadsRepo.getById(params.threadId)
    if (
      !thread ||
      thread.assistantId !== params.assistantId ||
      thread.resourceId !== params.profileId
    ) {
      throw new ChatRouteError(404, 'thread_not_found', 'Thread not found')
    }
  }

  private async getAssistantContext(assistantId: string): Promise<AssistantContext> {
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
      throw new ChatRouteError(409, 'assistant_not_ready', 'Assistant workspace is not configured')
    }

    return { assistant, provider }
  }

  private async ensureAgentRegistered(
    assistant: AssistantContext['assistant'],
    provider: AssistantContext['provider']
  ): Promise<void> {
    const nextSignature = [
      assistant.id,
      assistant.updatedAt,
      assistant.instructions,
      provider.id,
      provider.updatedAt,
      provider.type,
      provider.selectedModel,
      provider.apiHost ?? ''
    ].join('|')

    if (this.registeredAgentSignatures.get(assistant.id) === nextSignature) {
      return
    }

    const tools = provider.type === 'ollama' ? { browserSearch: browserSearchTool } : undefined
    const baseInstructions = assistant.instructions || 'You are a helpful assistant.'
    const agentInstructions = tools
      ? `${baseInstructions}\n\nWhen users ask for current web information, call the browserSearch tool before answering.`
      : baseInstructions

    const storage = this.options.mastra.getStorage()
    const memory = new MockMemory(
      storage ? { storage: storage as unknown as InMemoryStore } : undefined
    )

    const agent = new Agent({
      id: assistant.id,
      name: assistant.name,
      instructions: agentInstructions,
      model: resolveModel({
        type: provider.type,
        apiKey: provider.apiKey,
        apiHost: provider.apiHost,
        selectedModel: provider.selectedModel
      }) as never,
      memory,
      ...(tools ? { tools } : {})
    })

    this.options.mastra.addAgent(agent, assistant.id)
    this.registeredAgentSignatures.set(assistant.id, nextSignature)
  }
}
