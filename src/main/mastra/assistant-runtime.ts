import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Agent } from '@mastra/core/agent'
import type { AgentExecutionOptions, ToolsInput } from '@mastra/core/agent'
import type { MessageInput, MessageListInput } from '@mastra/core/agent/message-list'
import type { MemoryConfig } from '@mastra/core/memory'
import type { Mastra } from '@mastra/core/mastra'
import { BatchPartsProcessor, PIIDetector, PromptInjectionDetector } from '@mastra/core/processors'
import { RequestContext } from '@mastra/core/request-context'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { handleChatStream } from '@mastra/ai-sdk'
import { toAISdkV5Messages } from '@mastra/ai-sdk/ui'
import { Memory } from '@mastra/memory'
import { MCPClient, type MastraMCPServerDefinition } from '@mastra/mcp'
import type { UIMessage, UIMessageChunk } from 'ai'
import { ChannelEventBus } from '../channels/channel-event-bus'
import type { ChannelTarget } from '../channels/types'
import type { AssistantCronJobsService } from '../cron/assistant-cron-jobs-service'
import { buildHeartbeatWorklogContext } from '../heartbeat/heartbeat-context'
import { listRecentConversations } from '../heartbeat/recent-conversations'
import type { AssistantsRepository } from '../persistence/repos/assistants-repo'
import type { ChannelThreadBindingsRepository } from '../persistence/repos/channel-thread-bindings-repo'
import type {
  ManagedRuntimeKind,
  ManagedRuntimeRecord,
  ManagedRuntimesState
} from '../persistence/repos/managed-runtimes-repo'
import type { AppMcpServer, McpServersRepository } from '../persistence/repos/mcp-servers-repo'
import type { AppProvider, ProvidersRepository } from '../persistence/repos/providers-repo'
import type { SecuritySettingsRepository } from '../persistence/repos/security-settings-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import type { WebSearchSettingsRepository } from '../persistence/repos/web-search-settings-repo'
import { ChatRouteError } from '../server/chat/chat-errors'
import { ensureAssistantWorkspaceFiles } from './assistant-workspace'
import { resolveModel } from './model-resolver'
import { createBrowserSearchTool } from './tools/browser-search-tool'
import { createChannelTools } from './tools/channel-tools'
import { createCronTools } from './tools/cron-tools'
import {
  assistantWorkspaceContextInputProcessor,
  createSoulMemoryTools
} from './tools/soul-memory-tools'
import { createWorkLogTools } from './tools/work-log-tools'
import { createMemorySessionTools } from './tools/memory-session-tools'
import { AttachmentUploader } from './processors/attachment-uploader'
import { HEARTBEAT_RUN_CONTEXT_KEY } from './tool-context'

type StreamChatParams = {
  assistantId: string
  messages: MessageListInput
  threadId: string
  profileId: string
  channelTarget?: ChannelTarget
  trigger?: 'submit-message' | 'regenerate-message'
  abortSignal?: AbortSignal
}

type ListThreadMessagesParams = {
  assistantId: string
  threadId: string
  profileId: string
}

type RunCronJobParams = {
  assistantId: string
  threadId: string
  prompt: string
  channelId?: string
  remoteChatId?: string
}

type RunHeartbeatParams = {
  assistantId: string
  threadId: string
  prompt: string
  intervalMinutes: number
}

type CronJobRunResult = {
  outputText: string
}

type AssistantContext = {
  assistant: NonNullable<Awaited<ReturnType<AssistantsRepository['getById']>>>
  provider: NonNullable<Awaited<ReturnType<ProvidersRepository['getById']>>>
}

const CHANNEL_BREAK_TAG = '[[BR]]'
const CHANNEL_SPLITTER_INSTRUCTION =
  'When you want to split a reply into multiple channel messages, insert [[BR]] between chunks.'
const PROMPT_INJECTION_THRESHOLD = 0.8
const PII_THRESHOLD = 0.6

const ONBOARDING_INSTRUCTIONS = `
# First Conversation Onboarding

This is your first conversation! Let's set up your identity and personality.

## Your Task
1. **Introduce yourself warmly** - Tell the user you're a new assistant and excited to work with them
2. **Ask about your identity** - Ask the user:
   - What should your name be?
   - What kind of personality should you have? (professional, friendly, casual, etc.)
   - What's your main purpose? (customer support, coding assistant, general helper, etc.)
   - Any specific traits or characteristics they want you to have?

3. **Explain your workspace** - Let them know you have a workspace with these files:
   - IDENTITY.md - Where you'll save your name, personality, and avatar
   - SOUL.md - Your core values and how you should behave
   - MEMORY.md - Long-term facts and preferences you should remember

4. **After gathering their input**, use your tools to:
   - Update IDENTITY.md with your name, personality, and purpose
   - Update SOUL.md with your behavioral guidelines based on their preferences
   - Confirm the changes and let them know you're ready to help

Keep it conversational and friendly. This is about co-creating your identity together!
`.trim()

export type AssistantRuntime = {
  streamChat: (params: StreamChatParams) => Promise<ReadableStream<UIMessageChunk>>
  listThreadMessages: (params: ListThreadMessagesParams) => Promise<UIMessage[]>
  runCronJob: (params: RunCronJobParams) => Promise<CronJobRunResult>
  runHeartbeat: (params: RunHeartbeatParams) => Promise<CronJobRunResult>
}

type AssistantRuntimeServiceOptions = {
  mastra: Mastra
  assistantsRepo: AssistantsRepository
  providersRepo: ProvidersRepository
  threadsRepo: ThreadsRepository
  channelThreadBindingsRepo?: ChannelThreadBindingsRepository
  webSearchSettingsRepo: WebSearchSettingsRepository
  securitySettingsRepo?: Pick<SecuritySettingsRepository, 'getSettings'>
  mcpServersRepo: McpServersRepository
  channelsRepo?: {
    getByAssistantId(assistantId: string): Promise<{ id: string; type: string } | null>
  }
  channelEventBus?: ChannelEventBus
  threadMessageEventsStore?: {
    appendMessagesUpdated(input: {
      assistantId: string
      threadId: string
      profileId: string
      source?: 'channel' | 'cron' | 'heartbeat'
    }): void
  }
  cronJobService?: Pick<
    AssistantCronJobsService,
    'createCronJob' | 'listAssistantCronJobs' | 'removeAssistantCronJob'
  >
  managedRuntimeResolver?: {
    getStatus: () => Promise<ManagedRuntimesState>
    resolveManagedCommand: (
      command: string,
      args: string[],
      env?: NodeJS.ProcessEnv
    ) => Promise<{
      command: string
      args: string[]
      env: NodeJS.ProcessEnv
    }>
  }
}

type JsonObject = Record<string, unknown>

type ResolvedGuardrailConfig = {
  promptInjectionEnabled: boolean
  piiDetectionEnabled: boolean
  requestedProviderId: string | null
  provider: AppProvider
  source: 'assistant' | 'override'
}

export class AssistantRuntimeService implements AssistantRuntime {
  private readonly registeredAgentSignatures = new Map<string, string>()
  private readonly assistantMcpClients = new Map<string, MCPClient>()
  private readonly channelEventBus: ChannelEventBus

  constructor(private readonly options: AssistantRuntimeServiceOptions) {
    this.channelEventBus = options.channelEventBus ?? new ChannelEventBus()
  }

  async streamChat(params: StreamChatParams): Promise<ReadableStream<UIMessageChunk>> {
    const { assistant, provider } = await this.getAssistantContext(params.assistantId)
    const thread = await this.getThreadForAssistant({
      assistantId: params.assistantId,
      threadId: params.threadId
    })
    if (thread.resourceId !== params.profileId) {
      throw new ChatRouteError(404, 'thread_not_found', 'Thread not found')
    }
    await this.ensureAgentRegistered(assistant, provider, {
      channelDeliveryEnabled: Boolean(params.channelTarget)
    })

    // Create request context with channel context if available
    const requestContext = new RequestContext()
    if (params.channelTarget) {
      requestContext.set('channelContext', {
        channelId: params.channelTarget.channelId,
        chatId: params.channelTarget.remoteChatId,
        userId: params.profileId
      })
    }

    const stream = await handleChatStream({
      mastra: this.options.mastra,
      agentId: assistant.id,
      params: {
        messages: toAISdkV5Messages(params.messages),
        trigger: params.trigger,
        abortSignal: params.abortSignal,
        maxSteps: assistant.maxSteps,
        providerOptions: this.buildProviderOptions(provider.type),
        requestContext,
        memory: {
          thread: params.threadId,
          resource: params.profileId,
          options: {
            generateTitle: true
          }
        }
      },
      sendReasoning: true
    })

    return this.streamWithThreadTitleSync(stream as ReadableStream<UIMessageChunk>, {
      threadId: params.threadId,
      profileId: params.profileId,
      channelTarget: params.channelTarget
    })
  }

  async runCronJob(params: RunCronJobParams): Promise<CronJobRunResult> {
    console.log(
      `[AssistantRuntime] Running cron job for assistant "${params.assistantId}" with prompt: "${params.prompt}"`
    )
    console.log('[AssistantRuntime] Cron job params:', {
      assistantId: params.assistantId,
      threadId: params.threadId,
      prompt: params.prompt,
      promptLength: params.prompt?.length,
      channelId: params.channelId,
      remoteChatId: params.remoteChatId
    })

    const { assistant, provider } = await this.getAssistantContext(params.assistantId)
    const thread = await this.getThreadForAssistant({
      assistantId: params.assistantId,
      threadId: params.threadId
    })

    console.log(`[AssistantRuntime] Cron job thread ID: ${params.threadId}`)

    // Use channel context from params if provided
    const hasChannelTarget = Boolean(params.channelId && params.remoteChatId)

    if (hasChannelTarget) {
      console.log(
        `[AssistantRuntime] Cron job has channel target: channelId=${params.channelId}, remoteChatId=${params.remoteChatId}`
      )
    }

    await this.ensureAgentRegistered(assistant, provider, {
      channelDeliveryEnabled: hasChannelTarget,
      cronToolsEnabled: false // Disable cron tools during cron execution to prevent recursion
    })

    console.log(
      `[AssistantRuntime] Agent registered, starting chat stream (model: ${provider.selectedModel}, channel: ${hasChannelTarget ? 'yes' : 'no'})`
    )

    const requestContext = new RequestContext()

    // Set channel context if available so channel tools can access it
    if (hasChannelTarget && params.channelId && params.remoteChatId) {
      const channelContext = {
        channelId: params.channelId,
        remoteChatId: params.remoteChatId,
        userId: thread.resourceId
      }
      console.log('[AssistantRuntime] Setting channel context:', channelContext)
      requestContext.set('channelContext', channelContext)
    }

    const messages = this.buildScheduledRunMessages({
      kind: 'cron',
      threadId: params.threadId,
      prompt: params.prompt
    })

    console.log('[AssistantRuntime] Cron job messages being sent to agent:')
    console.log('[AssistantRuntime] Number of messages:', messages.length)
    messages.forEach((msg, idx) => {
      console.log(`  Message ${idx + 1} [${msg.role}]:`)
      console.log('    content:', msg.content)
      console.log('    parts:', JSON.stringify(msg.parts, null, 2))
    })
    console.log('[AssistantRuntime] Original prompt:', params.prompt)

    const stream = await handleChatStream({
      mastra: this.options.mastra,
      agentId: assistant.id,
      params: {
        messages,
        maxSteps: assistant.maxSteps,
        providerOptions: this.buildProviderOptions(provider.type),
        requestContext
        // No memory for cron jobs - they should execute without conversation history
      },
      sendReasoning: true
    })

    const outputText = await this.collectStreamText(stream as ReadableStream<UIMessageChunk>)

    console.log('[AssistantRuntime] Cron job stream completed')
    console.log('[AssistantRuntime] Collected output text length:', outputText.length)
    console.log('[AssistantRuntime] Output text preview:', outputText.substring(0, 200))

    // Fallback: If cron job has channel context but agent didn't send anything via tools,
    // send the collected output as a fallback message
    if (
      hasChannelTarget &&
      params.channelId &&
      params.remoteChatId &&
      outputText.trim().length > 0
    ) {
      console.log(`[AssistantRuntime] Cron job completed with ${outputText.length} chars output`)
      // Note: If agent used channel tools, messages were already sent during execution
      // This fallback ensures something is sent if agent didn't use tools
    }

    console.log(`[AssistantRuntime] Cron job completed`)
    // Notify UI that thread has new messages
    this.options.threadMessageEventsStore?.appendMessagesUpdated({
      assistantId: params.assistantId,
      threadId: params.threadId,
      profileId: thread.resourceId,
      source: 'cron'
    })

    return {
      outputText
    }
  }

  async runHeartbeat(params: RunHeartbeatParams): Promise<CronJobRunResult> {
    const { assistant, provider } = await this.getAssistantContext(params.assistantId)
    const thread = await this.getThreadForAssistant({
      assistantId: params.assistantId,
      threadId: params.threadId
    })
    await this.ensureAgentRegistered(assistant, provider, {
      channelDeliveryEnabled: true,
      cronToolsEnabled: true
    })

    const requestContext = new RequestContext()
    requestContext.set(HEARTBEAT_RUN_CONTEXT_KEY, randomUUID())

    const workspaceRootPath = this.resolveWorkspaceRootPath(assistant.workspaceConfig ?? {})
    const worklogContext = workspaceRootPath
      ? await buildHeartbeatWorklogContext({
          workspaceRootPath,
          intervalMinutes: params.intervalMinutes
        })
      : null

    const stream = await handleChatStream({
      mastra: this.options.mastra,
      agentId: assistant.id,
      params: {
        messages: this.buildScheduledRunMessages({
          kind: 'heartbeat',
          threadId: params.threadId,
          prompt: params.prompt,
          systemContext: worklogContext
        }),
        maxSteps: assistant.maxSteps,
        providerOptions: this.buildProviderOptions(provider.type),
        requestContext
      },
      sendReasoning: true
    })

    const outputText = await this.collectStreamText(stream as ReadableStream<UIMessageChunk>)

    // Notify UI that thread has new messages
    this.options.threadMessageEventsStore?.appendMessagesUpdated({
      assistantId: params.assistantId,
      threadId: params.threadId,
      profileId: thread.resourceId,
      source: 'heartbeat'
    })

    return {
      outputText
    }
  }

  private buildScheduledRunMessages(input: {
    kind: 'cron' | 'heartbeat'
    threadId: string
    prompt: string
    systemContext?: string | null
  }): ReturnType<typeof toAISdkV5Messages> {
    console.log('[buildScheduledRunMessages] Input:', {
      kind: input.kind,
      prompt: input.prompt,
      promptLength: input.prompt?.length
    })

    const messages: MessageInput[] = []

    // For cron jobs, prepend instructions to the user message since AI SDK v5 doesn't support system messages
    let userMessage = input.prompt
    if (input.kind === 'cron') {
      const now = new Date()
      const cronInstructions = `[CRON JOB EXECUTION - ${now.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'long' })}]

You are executing a SCHEDULED REMINDER that was already created. This is NOT a new request.

CRITICAL INSTRUCTIONS:
1. The user is NOT asking you to create a reminder - the reminder ALREADY EXISTS and is running NOW
2. DO NOT save anything to SOUL.md or MEMORY.md - this is just executing an existing reminder
3. DO NOT create new cron jobs - this reminder is already scheduled
4. You MUST call the sendMessageToChannel tool to deliver the reminder message
5. Keep the message simple and direct - just deliver the reminder

Example:
- Task: "提醒我：开会了。"
- Action: Call sendMessageToChannel({ message: "提醒：开会了。" })

DO NOT explain, DO NOT save to memory, DO NOT create tasks - JUST SEND THE REMINDER MESSAGE.

---
TASK TO EXECUTE NOW:
${input.prompt}`

      userMessage = cronInstructions
      console.log('[buildScheduledRunMessages] Prepended cron instructions to user message')
    }

    if (input.systemContext) {
      // For heartbeat, prepend system context to user message
      userMessage = `${input.systemContext}\n\n---\n${userMessage}`
    }

    // Add the user message with instructions prepended
    console.log('[buildScheduledRunMessages] Adding user message, length:', userMessage.length)
    messages.push({
      id: `${input.kind}:${input.threadId}:${randomUUID()}`,
      role: 'user',
      content: userMessage,
      parts: [
        {
          type: 'text',
          text: userMessage
        }
      ]
    })

    console.log('[buildScheduledRunMessages] Messages before transformation:', messages.length)
    const transformed = toAISdkV5Messages(messages)
    console.log('[buildScheduledRunMessages] Messages after transformation:', transformed.length)

    return transformed
  }

  private streamWithThreadTitleSync(
    stream: ReadableStream<UIMessageChunk>,
    params: {
      threadId: string
      profileId: string
      channelTarget?: ChannelTarget
    }
  ): ReadableStream<UIMessageChunk> {
    const reader = stream.getReader()
    let isSynced = false
    let channelTextBuffer = ''

    const publishCompletedChannelChunks = async (): Promise<void> => {
      if (!params.channelTarget || !channelTextBuffer.includes(CHANNEL_BREAK_TAG)) {
        return
      }

      const chunks = channelTextBuffer.split(CHANNEL_BREAK_TAG)
      for (let index = 0; index < chunks.length - 1; index += 1) {
        await this.publishChannelReplyChunk({
          channelTarget: params.channelTarget,
          text: chunks[index] ?? ''
        })
      }
      channelTextBuffer = chunks[chunks.length - 1] ?? ''
    }

    const flushFinalChannelChunk = async (): Promise<void> => {
      if (!params.channelTarget) {
        return
      }

      await this.publishChannelReplyChunk({
        channelTarget: params.channelTarget,
        text: channelTextBuffer
      })
      channelTextBuffer = ''
    }

    return new ReadableStream<UIMessageChunk>({
      pull: async (controller) => {
        try {
          const { done, value } = await reader.read()
          if (done) {
            if (!isSynced) {
              isSynced = true
              await flushFinalChannelChunk()
              await this.syncThreadAfterStreaming(params)
            }
            controller.close()
            reader.releaseLock()
            return
          }

          // Handle text deltas for channel delivery
          if (value.type === 'text-delta' && typeof value.delta === 'string') {
            channelTextBuffer += value.delta
            await publishCompletedChannelChunks()
          }

          // Pass through tool-input-available events immediately for UI visibility
          if (value.type === 'tool-input-available') {
            controller.enqueue(value)
            return
          }

          // Pass through tool-output-available events immediately for UI visibility
          if (value.type === 'tool-output-available') {
            controller.enqueue(value)
            return
          }

          // Pass through tool-output-error events for error visibility
          if (value.type === 'tool-output-error') {
            controller.enqueue(value)
            return
          }

          // Pass through start-step events for multi-step visibility
          if (value.type === 'start-step') {
            controller.enqueue(value)
            return
          }

          // Pass through finish-step events
          if (value.type === 'finish-step') {
            controller.enqueue(value)
            return
          }

          // Capture usage from finish chunk and add to message metadata
          if (value.type === 'finish' && 'totalUsage' in value) {
            const usage = value.totalUsage as {
              inputTokens: number
              outputTokens: number
              totalTokens: number
            }

            // Add usage to message metadata
            controller.enqueue({
              ...value,
              messageMetadata: {
                ...(value.messageMetadata || {}),
                usage
              }
            } as UIMessageChunk)
          } else {
            // Pass through all other events (text-delta, etc.)
            controller.enqueue(value)
          }
        } catch (error) {
          controller.error(error)
          reader.releaseLock()
        }
      },
      cancel: async (reason) => {
        try {
          await reader.cancel(reason)
        } finally {
          reader.releaseLock()
        }

        if (!isSynced) {
          isSynced = true
          await this.syncThreadAfterStreaming(params)
        }
      }
    })
  }

  private async syncThreadAfterStreaming(params: {
    threadId: string
    profileId: string
  }): Promise<void> {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
    await this.options.threadsRepo.touchLastMessageAt(params.threadId, now).catch(() => undefined)
    await this.syncGeneratedThreadTitle(params).catch(() => undefined)
  }

  private async publishChannelReplyChunk(input: {
    channelTarget?: ChannelTarget
    text: string
  }): Promise<void> {
    if (!input.channelTarget) {
      return
    }

    const normalizedText = input.text.trim()
    if (normalizedText.length === 0) {
      return
    }

    await this.channelEventBus.publish('channel.message.send-requested', {
      eventId: randomUUID(),
      channelId: input.channelTarget.channelId,
      channelType: input.channelTarget.channelType,
      remoteChatId: input.channelTarget.remoteChatId,
      content: normalizedText,
      payload: {
        type: 'text',
        text: normalizedText
      }
    })
  }

  private async syncGeneratedThreadTitle(params: {
    threadId: string
    profileId: string
  }): Promise<void> {
    const appThread = await this.options.threadsRepo.getById(params.threadId)
    if (!appThread || appThread.resourceId !== params.profileId) {
      return
    }

    if (!this.shouldReplaceThreadTitle(appThread.title)) {
      return
    }

    const storage = this.options.mastra.getStorage()
    if (!storage) {
      return
    }

    const memoryStore = await storage.getStore('memory')
    if (!memoryStore || typeof memoryStore.getThreadById !== 'function') {
      return
    }

    const memoryThread = await memoryStore.getThreadById({
      threadId: params.threadId
    })
    const generatedTitle = this.toNonEmptyString(memoryThread?.title)
    if (!generatedTitle || appThread.title.trim() === generatedTitle) {
      return
    }

    await this.options.threadsRepo.updateTitle(params.threadId, generatedTitle)
  }

  private shouldReplaceThreadTitle(title: string): boolean {
    const normalizedTitle = title.trim()
    if (normalizedTitle.length === 0) {
      return true
    }

    return /^New Thread(?: \d+)?$/i.test(normalizedTitle)
  }

  async listThreadMessages(params: ListThreadMessagesParams): Promise<UIMessage[]> {
    await this.assertAssistantExists(params.assistantId)
    const thread = await this.getThreadForAssistant({
      assistantId: params.assistantId,
      threadId: params.threadId
    })
    if (thread.resourceId !== params.profileId) {
      throw new ChatRouteError(404, 'thread_not_found', 'Thread not found')
    }

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

    return toAISdkV5Messages(messages)
      .filter((message) => message.role === 'assistant' || message.role === 'user')
      .map((message) => message as UIMessage)
  }

  private async assertAssistantExists(assistantId: string): Promise<void> {
    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      throw new ChatRouteError(404, 'assistant_not_found', 'Assistant not found')
    }
  }

  private async getThreadForAssistant(params: {
    assistantId: string
    threadId: string
  }): Promise<NonNullable<Awaited<ReturnType<ThreadsRepository['getById']>>>> {
    const thread = await this.options.threadsRepo.getById(params.threadId)
    if (!thread || thread.assistantId !== params.assistantId) {
      throw new ChatRouteError(404, 'thread_not_found', 'Thread not found')
    }

    return thread
  }

  private async collectStreamText(stream: ReadableStream<UIMessageChunk>): Promise<string> {
    const reader = stream.getReader()
    const responseTextParts: string[] = []

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        if (value.type === 'text-delta' && typeof value.delta === 'string') {
          responseTextParts.push(value.delta)
        }
      }
    } finally {
      reader.releaseLock()
    }

    return responseTextParts.join('')
  }

  private async getAssistantContext(assistantId: string): Promise<AssistantContext> {
    const assistant = await this.options.assistantsRepo.getById(assistantId)
    if (!assistant) {
      throw new ChatRouteError(404, 'assistant_not_found', 'Assistant not found')
    }

    if (!assistant.providerId) {
      throw new ChatRouteError(409, 'provider_not_found', 'Assistant provider is not configured')
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

    return { assistant, provider }
  }

  private async ensureAgentRegistered(
    assistant: AssistantContext['assistant'],
    provider: AssistantContext['provider'],
    options: {
      channelDeliveryEnabled: boolean
      cronToolsEnabled?: boolean
    } = {
      channelDeliveryEnabled: false,
      cronToolsEnabled: true
    }
  ): Promise<void> {
    const enabledMcpServers = await this.resolveEnabledMcpServers(assistant.mcpConfig ?? {})
    const mcpServersSignature = JSON.stringify(enabledMcpServers)
    const guardrailConfig = await this.resolveGuardrailConfig(provider)
    const nextSignature = [
      assistant.id,
      assistant.updatedAt,
      assistant.instructions,
      provider.id,
      provider.updatedAt,
      provider.type,
      provider.selectedModel,
      provider.apiHost ?? '',
      JSON.stringify(assistant.workspaceConfig ?? {}),
      JSON.stringify(assistant.skillsConfig ?? {}),
      JSON.stringify(assistant.mcpConfig ?? {}),
      assistant.maxSteps,
      JSON.stringify(assistant.memoryConfig ?? {}),
      mcpServersSignature,
      guardrailConfig.promptInjectionEnabled ? 'prompt-injection:on' : 'prompt-injection:off',
      guardrailConfig.piiDetectionEnabled ? 'pii:on' : 'pii:off',
      guardrailConfig.requestedProviderId ?? '',
      guardrailConfig.source,
      guardrailConfig.provider.id,
      guardrailConfig.provider.updatedAt,
      guardrailConfig.provider.type,
      guardrailConfig.provider.selectedModel,
      guardrailConfig.provider.apiHost ?? '',
      options.channelDeliveryEnabled ? 'channel-delivery:on' : 'channel-delivery:off',
      options.cronToolsEnabled !== false ? 'cron-tools:on' : 'cron-tools:off'
    ].join('|')

    if (this.registeredAgentSignatures.get(assistant.id) === nextSignature) {
      return
    }

    this.options.mastra.removeAgent(assistant.id)

    const browserSearchTool = createBrowserSearchTool({
      resolveDefaultEngine: async () => this.options.webSearchSettingsRepo.getDefaultEngine(),
      resolveKeepBrowserWindowOpen: async () =>
        this.options.webSearchSettingsRepo.getKeepBrowserWindowOpen(),
      resolveShowBrowser: async () => this.options.webSearchSettingsRepo.getShowBrowser()
    })

    const model = resolveModel({
      type: provider.type,
      apiKey: provider.apiKey,
      apiHost: provider.apiHost,
      selectedModel: provider.selectedModel
    })
    const guardrailModel = resolveModel({
      type: guardrailConfig.provider.type,
      apiKey: guardrailConfig.provider.apiKey,
      apiHost: guardrailConfig.provider.apiHost,
      selectedModel: guardrailConfig.provider.selectedModel
    })

    const storage = this.options.mastra.getStorage()
    const memory = new Memory({
      ...(storage ? { storage } : {}),
      options: {
        ...this.resolveMemoryOptions(assistant.memoryConfig),
        generateTitle: true
      }
    })

    const mcpTools = await this.buildMcpTools(assistant.id, enabledMcpServers)
    const workspaceRootPath = this.resolveWorkspaceRootPath(assistant.workspaceConfig ?? {})
    const soulMemoryTools = workspaceRootPath ? createSoulMemoryTools({ workspaceRootPath }) : {}
    const workLogTools = workspaceRootPath ? createWorkLogTools({ workspaceRootPath }) : {}
    const cronTools =
      workspaceRootPath && this.options.cronJobService && options.cronToolsEnabled !== false
        ? createCronTools({
            assistantId: assistant.id,
            cronJobService: this.options.cronJobService
          })
        : {}
    const channelTools = options.channelDeliveryEnabled
      ? createChannelTools({
          bus: this.channelEventBus,
          workspaceRootPath,
          resolveRecentConversations: this.options.channelThreadBindingsRepo
            ? async () =>
                listRecentConversations({
                  assistantId: assistant.id,
                  threadsRepo: this.options.threadsRepo,
                  channelThreadBindingsRepo: this.options
                    .channelThreadBindingsRepo as ChannelThreadBindingsRepository,
                  mastra: this.options.mastra
                })
            : undefined
        })
      : {}

    console.log('[AssistantRuntime] Agent tools registered:', {
      hasCronTools: Object.keys(cronTools).length > 0,
      hasChannelTools: Object.keys(channelTools).length > 0,
      channelToolNames: Object.keys(channelTools),
      cronToolsEnabled: options.cronToolsEnabled,
      channelDeliveryEnabled: options.channelDeliveryEnabled
    })

    const memorySessionTools = createMemorySessionTools(memory)
    const tools: ToolsInput = {
      browserSearch: browserSearchTool,
      ...soulMemoryTools,
      ...workLogTools,
      ...cronTools,
      ...channelTools,
      ...memorySessionTools,
      ...mcpTools
    }
    const now = new Date()
    const currentDateTime = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    })

    const hasAnyThreads =
      typeof this.options.threadsRepo.hasAnyThreads === 'function'
        ? await this.options.threadsRepo.hasAnyThreads(assistant.id)
        : true
    const isFirstConversation = !hasAnyThreads
    const baseInstructions = assistant.instructions || 'You are a helpful assistant.'
    const onboardingInstructions = isFirstConversation ? `\n\n${ONBOARDING_INSTRUCTIONS}\n` : ''
    const channelInstructions = options.channelDeliveryEnabled
      ? `\nChannel delivery guidelines:\n- ${CHANNEL_SPLITTER_INSTRUCTION}\n- Keep channel replies short and natural.\n- Do not mention [[BR]] to the user.\n`
      : ''
    const agentInstructions = `${baseInstructions}${onboardingInstructions}\n\nCurrent date and time: ${currentDateTime}\n${channelInstructions}\n`
    const workspace = await this.buildWorkspace(
      assistant.workspaceConfig ?? {},
      assistant.skillsConfig ?? {}
    )
    const inputProcessors = [
      ...(workspaceRootPath
        ? [assistantWorkspaceContextInputProcessor({ workspaceRootPath })]
        : []),
      ...(guardrailConfig.promptInjectionEnabled
        ? [
            new PromptInjectionDetector({
              model: guardrailModel,
              threshold: PROMPT_INJECTION_THRESHOLD,
              strategy: 'warn'
            })
          ]
        : []),
      ...(guardrailConfig.piiDetectionEnabled
        ? [
            new PIIDetector({
              model: guardrailModel,
              threshold: PII_THRESHOLD,
              strategy: 'redact',
              redactionMethod: 'mask'
            })
          ]
        : []),
      new AttachmentUploader()
    ]
    const outputProcessors = guardrailConfig.piiDetectionEnabled
      ? [
          new BatchPartsProcessor({
            batchSize: 10
          }),
          new PIIDetector({
            model: guardrailModel,
            threshold: PII_THRESHOLD,
            strategy: 'redact',
            redactionMethod: 'mask'
          })
        ]
      : []

    const agent = new Agent({
      id: assistant.id,
      name: assistant.name,
      instructions: agentInstructions,
      model: model as never,
      memory,
      ...(workspace ? { workspace } : {}),
      tools,
      inputProcessors,
      ...(outputProcessors.length > 0 ? { outputProcessors } : {})
    })

    this.options.mastra.addAgent(agent, assistant.id)
    this.registeredAgentSignatures.set(assistant.id, nextSignature)
  }

  private async resolveGuardrailConfig(
    assistantProvider: AssistantContext['provider']
  ): Promise<ResolvedGuardrailConfig> {
    const defaultSettings = {
      promptInjectionEnabled: false,
      piiDetectionEnabled: false,
      guardrailProviderId: null
    }
    const settings = this.options.securitySettingsRepo
      ? await this.options.securitySettingsRepo.getSettings()
      : defaultSettings
    const requestedProviderId = this.toNonEmptyString(settings.guardrailProviderId)

    if (!requestedProviderId) {
      return {
        promptInjectionEnabled: settings.promptInjectionEnabled,
        piiDetectionEnabled: settings.piiDetectionEnabled,
        requestedProviderId: null,
        provider: assistantProvider,
        source: 'assistant'
      }
    }

    const overrideProvider = await this.options.providersRepo.getById(requestedProviderId)
    if (!this.isUsableGuardrailProvider(overrideProvider)) {
      return {
        promptInjectionEnabled: settings.promptInjectionEnabled,
        piiDetectionEnabled: settings.piiDetectionEnabled,
        requestedProviderId,
        provider: assistantProvider,
        source: 'assistant'
      }
    }

    return {
      promptInjectionEnabled: settings.promptInjectionEnabled,
      piiDetectionEnabled: settings.piiDetectionEnabled,
      requestedProviderId,
      provider: overrideProvider,
      source: 'override'
    }
  }

  private isUsableGuardrailProvider(provider: AppProvider | null): provider is AppProvider {
    return Boolean(provider && provider.enabled && provider.selectedModel.trim().length > 0)
  }

  private async buildWorkspace(
    workspaceConfig: JsonObject,
    skillsConfig: JsonObject
  ): Promise<Workspace | undefined> {
    const rootPath = this.resolveWorkspaceRootPath(workspaceConfig)
    if (!rootPath) {
      return undefined
    }

    await ensureAssistantWorkspaceFiles(rootPath)

    const skillsPaths = this.resolveSkillsPaths(rootPath, skillsConfig)
    const filesystem = new LocalFilesystem({ basePath: rootPath })
    const sandbox = new LocalSandbox({
      workingDirectory: rootPath
    })
    const workspace = new Workspace({
      filesystem,
      sandbox,
      ...(skillsPaths.length > 0 ? { skills: skillsPaths } : {})
    })

    await workspace.init()
    return workspace
  }

  private resolveWorkspaceRootPath(workspaceConfig: JsonObject): string | null {
    const rootPath = this.toNonEmptyString(workspaceConfig.rootPath)
    return rootPath ? path.resolve(rootPath) : null
  }

  private resolveSkillsPaths(workspaceRootPath: string, skillsConfig: JsonObject): string[] {
    const rawPaths = [
      path.join(os.homedir(), '.claude', 'skills'),
      path.join(os.homedir(), '.agent', 'skills'),
      path.join(workspaceRootPath, 'skills'),
      ...this.toStringList(skillsConfig.path),
      ...this.toStringList(skillsConfig.paths),
      ...this.toStringList(skillsConfig.skillPath),
      ...this.toStringList(skillsConfig.skillPaths),
      ...this.toStringList(skillsConfig.skills),
      ...this.toStringList(skillsConfig.directories)
    ]

    const uniquePaths = new Set<string>()
    for (const rawPath of rawPaths) {
      uniquePaths.add(rawPath)
    }

    return [...uniquePaths]
  }

  private async resolveEnabledMcpServers(
    mcpConfig: JsonObject
  ): Promise<Record<string, AppMcpServer>> {
    let settings: Awaited<ReturnType<McpServersRepository['getSettings']>>
    try {
      settings = await this.options.mcpServersRepo.getSettings()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to read MCP settings'
      throw new ChatRouteError(409, 'mcp_settings_invalid', message)
    }

    const assistantEnabledServers = this.toBooleanMap(mcpConfig)

    const entries = Object.entries(settings.mcpServers)
      .filter(
        ([serverName, server]) => server.isActive && assistantEnabledServers[serverName] === true
      )
      .sort(([left], [right]) => left.localeCompare(right))

    return Object.fromEntries(entries)
  }

  private async buildMcpTools(
    assistantId: string,
    enabledMcpServers: Record<string, AppMcpServer>
  ): Promise<ToolsInput> {
    if (Object.keys(enabledMcpServers).length === 0) {
      await this.disconnectMcpClient(assistantId)
      return {}
    }

    const serverDefinitions = await this.toMcpServerDefinitions(enabledMcpServers)
    if (Object.keys(serverDefinitions).length === 0) {
      await this.disconnectMcpClient(assistantId)
      return {}
    }

    await this.disconnectMcpClient(assistantId)

    const mcpClient = new MCPClient({
      id: `assistant-${assistantId}`,
      servers: serverDefinitions
    })

    try {
      const tools = await mcpClient.listTools()
      this.assistantMcpClients.set(assistantId, mcpClient)
      return tools as ToolsInput
    } catch (error) {
      await mcpClient.disconnect().catch(() => undefined)
      const message =
        error instanceof Error ? error.message : 'Unable to connect to one or more MCP servers'
      throw new ChatRouteError(409, 'mcp_connection_failed', message)
    }
  }

  private async toMcpServerDefinitions(
    servers: Record<string, AppMcpServer>
  ): Promise<Record<string, MastraMCPServerDefinition>> {
    const entries = (
      await Promise.all(
        Object.entries(servers).map(async ([serverName, server]) => {
          const definition = await this.toMcpServerDefinition(server)
          if (!definition) {
            return null
          }

          return [serverName, definition] as const
        })
      )
    ).filter((entry): entry is readonly [string, MastraMCPServerDefinition] => entry !== null)

    return Object.fromEntries(entries)
  }

  private async toMcpServerDefinition(
    server: AppMcpServer
  ): Promise<MastraMCPServerDefinition | null> {
    const command = this.toNonEmptyString(server.command)
    const url = this.toNonEmptyString(server.url)
    const serverType = server.type.trim().toLowerCase()

    if (serverType === 'stdio') {
      if (!command) {
        return null
      }

      return this.toCommandMcpServerDefinition(command, server.args, server.env)
    }

    if (url) {
      try {
        return {
          url: new URL(url)
        }
      } catch {
        // ignore invalid URLs in MCP server definitions
      }
    }

    if (command) {
      return this.toCommandMcpServerDefinition(command, server.args, server.env)
    }

    return null
  }

  private async toCommandMcpServerDefinition(
    command: string,
    args: string[],
    env: Record<string, string>
  ): Promise<MastraMCPServerDefinition> {
    const resolved = await this.resolveManagedCommand(command, args, env)
    const normalizedEnv = this.toStringMap(resolved.env)

    return {
      command: resolved.command,
      ...(resolved.args.length > 0 ? { args: resolved.args } : {}),
      ...(Object.keys(normalizedEnv).length > 0 ? { env: normalizedEnv } : {})
    }
  }

  private async resolveManagedCommand(
    command: string,
    args: string[],
    env: Record<string, string>
  ): Promise<{
    command: string
    args: string[]
    env: NodeJS.ProcessEnv
  }> {
    const runtimeResolver = this.options.managedRuntimeResolver
    if (!runtimeResolver) {
      return {
        command,
        args,
        env
      }
    }

    const requiredRuntime = this.getRequiredManagedRuntimeKind(command)
    if (requiredRuntime) {
      const status = await runtimeResolver.getStatus()
      if (!this.isManagedRuntimeReady(status[requiredRuntime])) {
        throw new ChatRouteError(
          409,
          'managed_runtime_missing',
          `This MCP server uses ${command}, which requires the ${requiredRuntime} managed runtime. Open Runtime Setup to install or select ${requiredRuntime}.`
        )
      }
    }

    return runtimeResolver.resolveManagedCommand(command, args, env)
  }

  private getRequiredManagedRuntimeKind(command: string): ManagedRuntimeKind | null {
    const normalized = command.trim().toLowerCase()

    if (normalized === 'npx' || normalized === 'bun' || normalized === 'bunx') {
      return 'bun'
    }

    if (normalized === 'uv' || normalized === 'uvx') {
      return 'uv'
    }

    return null
  }

  private isManagedRuntimeReady(record: ManagedRuntimeRecord | undefined): boolean {
    if (!record) {
      return false
    }

    return (
      Boolean(record.binaryPath) &&
      (record.status === 'ready' ||
        record.status === 'custom-ready' ||
        record.status === 'update-available')
    )
  }

  private async disconnectMcpClient(assistantId: string): Promise<void> {
    const existingClient = this.assistantMcpClients.get(assistantId)
    if (!existingClient) {
      return
    }

    this.assistantMcpClients.delete(assistantId)
    await existingClient.disconnect().catch(() => undefined)
  }

  private resolveMemoryOptions(memoryConfig: JsonObject | null): MemoryConfig {
    const memoryConfigObject = memoryConfig ?? {}
    const explicitOptions = this.toJsonObject(memoryConfigObject.options)
    const baseOptions =
      Object.keys(explicitOptions).length > 0 ? explicitOptions : memoryConfigObject

    return {
      ...(baseOptions as MemoryConfig),
      generateTitle: true
    }
  }

  private buildProviderOptions(providerType: string): AgentExecutionOptions['providerOptions'] {
    if (providerType !== 'openai-response') {
      return undefined
    }

    return {
      openai: {
        store: false
      }
    }
  }

  private toStringList(value: unknown): string[] {
    if (typeof value === 'string') {
      return this.toNonEmptyString(value) ? [value.trim()] : []
    }

    if (!Array.isArray(value)) {
      return []
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }

  private toBooleanMap(value: unknown): Record<string, boolean> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {}
    }

    const entries = Object.entries(value)
      .map(([key, itemValue]) => {
        const normalizedKey = key.trim()
        if (normalizedKey.length === 0) {
          return null
        }

        if (typeof itemValue === 'boolean') {
          return [normalizedKey, itemValue] as const
        }

        if (typeof itemValue === 'string') {
          const normalizedValue = itemValue.trim().toLowerCase()
          if (normalizedValue === 'true' || normalizedValue === '1') {
            return [normalizedKey, true] as const
          }

          if (normalizedValue === 'false' || normalizedValue === '0') {
            return [normalizedKey, false] as const
          }
        }

        if (typeof itemValue === 'number') {
          return [normalizedKey, itemValue !== 0] as const
        }

        return null
      })
      .filter((entry): entry is readonly [string, boolean] => entry !== null)

    return Object.fromEntries(entries)
  }

  private toStringMap(value: NodeJS.ProcessEnv): Record<string, string> {
    const entries = Object.entries(value)
      .map(([key, rawValue]) => {
        const normalizedKey = key.trim()
        if (normalizedKey.length === 0 || typeof rawValue !== 'string') {
          return null
        }

        return [normalizedKey, rawValue] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null)

    return Object.fromEntries(entries)
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  private toJsonObject(value: unknown): JsonObject {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as JsonObject
    }

    return {}
  }
}
