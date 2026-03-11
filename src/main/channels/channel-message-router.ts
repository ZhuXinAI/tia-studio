import { randomUUID } from 'node:crypto'
import type { UIMessageWithMetadata } from '@mastra/core/agent/message-list'
import type { UIMessageChunk } from 'ai'
import type { AssistantRuntime } from '../mastra/assistant-runtime'
import type { ChannelThreadBindingsRepository } from '../persistence/repos/channel-thread-bindings-repo'
import type { ChannelsRepository } from '../persistence/repos/channels-repo'
import type { ThreadsRepository } from '../persistence/repos/threads-repo'
import { ChannelEventBus } from './channel-event-bus'
import type { ChannelMessageReceivedEvent } from './types'
import { logger } from '../utils/logger'

type InterruptionDecision = {
  decision: 'interrupt' | 'queue'
  reason: string
}

type InterruptionDecisionInput = {
  activeTaskSummary: string
  incomingMessage: string
  queuedMessageCount: number
}

type WorkItemCompletion = {
  promise: Promise<void>
  resolve: () => void
}

type InboundConversationWorkItem = {
  assistantId: string
  threadId: string
  event: ChannelMessageReceivedEvent
  userMessage: UIMessageWithMetadata
  resumed?: boolean
  completion: WorkItemCompletion
}

type ActiveConversationRun = {
  item: InboundConversationWorkItem
  abortController: AbortController
  startedAt: number
  isPaused: boolean
}

type ConversationExecutionState = {
  queue: InboundConversationWorkItem[]
  pausedTasks: InboundConversationWorkItem[]
  activeRun?: ActiveConversationRun
}

type ChannelMessageRouterOptions = {
  eventBus: ChannelEventBus
  channelsRepo: Pick<ChannelsRepository, 'getById' | 'getRuntimeById'>
  bindingsRepo: ChannelThreadBindingsRepository
  threadsRepo: ThreadsRepository
  assistantRuntime: AssistantRuntime
  threadMessageEventsStore?: {
    appendMessagesUpdated(input: {
      assistantId: string
      threadId: string
      profileId: string
      source?: 'channel'
    }): unknown
  }
  interruptionDecider?:
    | ((input: InterruptionDecisionInput) => InterruptionDecision | Promise<InterruptionDecision>)
    | undefined
}

const DEFAULT_PROFILE_ID = 'default-profile'
const DEFAULT_THREAD_TITLE = 'New Thread'
const EMPTY_ASSISTANT_REPLY_MESSAGE = '[Error] Failed to generate a response. Please try again.'
const INTERRUPTION_REPLY_MESSAGES = {
  interrupt: 'Understood — pausing the current reply and switching now.',
  queue: 'Got it — I’ll handle this right after the current reply.'
} as const
const RESUME_RECOGNIZED_REPLY = 'Resuming the paused request now.'
const RESUME_NOT_AVAILABLE_REPLY = 'There is no paused request to resume right now.'
const RESUME_COMMANDS = new Set(['continue', 'resume', 'go on', 'carry on', '继续', '接着'])
const HARD_INTERRUPT_PATTERNS = [
  /\b(stop|cancel|abort|pause|drop|forget)\b/i,
  /\b(urgent|asap|emergency|p0|sev[ -]?1|critical)\b/i,
  /\b(instead|switch|different task|change of plan|new priority)\b/i,
  /\b(do this first|handle this first|right now|immediately)\b/i
]
const SOFT_QUEUE_PATTERNS = [
  /\b(also|after that|when done|later|next|follow[- ]?up)\b/i,
  /\b(additionally|in addition|by the way)\b/i
]

function toFriendlyErrorMessage(raw: string): string {
  let statusCode: number | undefined
  let message = ''

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.statusCode === 'number') statusCode = parsed.statusCode
    if (typeof parsed.message === 'string') message = parsed.message
  } catch {
    message = raw
  }

  if (statusCode === 401 || statusCode === 403) {
    return 'Authentication failed. Please check the API key in provider settings.'
  }
  if (statusCode === 404) {
    return 'The configured model or API endpoint was not found. Please check the provider settings.'
  }
  if (statusCode === 429) {
    return 'Too many requests. Please wait a moment and try again.'
  }
  if (statusCode && statusCode >= 500 && statusCode <= 599) {
    return "The AI provider's server encountered an error. Please try again later."
  }

  const lower = message.toLowerCase()
  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('timeout') ||
    lower.includes('connection refused')
  ) {
    return 'Unable to connect to the AI provider. Please check the network and API host configuration.'
  }

  return 'Failed to generate a response. Please check the provider configuration.'
}

async function drainStreamWithToolUpdates(
  stream: ReadableStream<UIMessageChunk>,
  onToolUpdate?: (message: string) => Promise<void>
): Promise<string> {
  const reader = stream.getReader()
  let assistantText = ''
  let streamError: string | null = null
  const toolNamesByCallId = new Map<string, string>()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      if (value.type === 'text-delta') {
        assistantText += value.delta
      } else if (value.type === 'error') {
        streamError = value.errorText
      } else if (value.type === 'tool-input-available' && onToolUpdate) {
        toolNamesByCallId.set(value.toolCallId, value.toolName)
      } else if (value.type === 'tool-output-available' && onToolUpdate) {
        const toolName = toolNamesByCallId.get(value.toolCallId)
        if (toolName) {
          const toolMessage = formatToolResultUpdate({
            toolName
          })
          if (toolMessage) {
            await onToolUpdate(toolMessage)
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (streamError && assistantText.trim().length === 0) {
    throw new Error(streamError)
  }

  return assistantText
}

function formatToolResultUpdate(toolResult: { toolName: string }): string | null {
  const toolResultMessages: Record<string, string> = {
    browserSearch: '✅ Search completed',
    createCronJob: '✅ Reminder set',
    removeCronJob: '✅ Reminder removed',
    writeSoulMemory: '✅ Memory saved',
    writeWorkLog: '✅ Work log updated'
  }

  return toolResultMessages[toolResult.toolName] ?? null
}

function toErrorLogMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unknown error occurred'
}

function createWorkItemCompletion(): WorkItemCompletion {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function describeWorkItem(item: InboundConversationWorkItem): string {
  const content = item.userMessage.content.trim()
  return content.length > 0 ? content : '(empty user message)'
}

function decideInterruptionHeuristically(input: InterruptionDecisionInput): InterruptionDecision {
  const message = input.incomingMessage.trim()
  if (message.length === 0) {
    return {
      decision: 'queue',
      reason: INTERRUPTION_REPLY_MESSAGES.queue
    }
  }

  if (HARD_INTERRUPT_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      decision: 'interrupt',
      reason: INTERRUPTION_REPLY_MESSAGES.interrupt
    }
  }

  if (SOFT_QUEUE_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      decision: 'queue',
      reason: INTERRUPTION_REPLY_MESSAGES.queue
    }
  }

  return {
    decision: 'queue',
    reason: INTERRUPTION_REPLY_MESSAGES.queue
  }
}

export class ChannelMessageRouter {
  private unsubscribeReceived: (() => void) | null = null
  private readonly conversationStates = new Map<string, ConversationExecutionState>()
  private readonly controlChainsByConversation = new Map<string, Promise<void>>()

  constructor(private readonly options: ChannelMessageRouterOptions) {}

  async start(): Promise<void> {
    if (this.unsubscribeReceived) {
      return
    }

    this.unsubscribeReceived = this.options.eventBus.subscribe(
      'channel.message.received',
      async (event) => {
        await this.handleInboundEvent(event)
      }
    )
  }

  async stop(): Promise<void> {
    if (this.unsubscribeReceived) {
      this.unsubscribeReceived()
      this.unsubscribeReceived = null
    }

    for (const state of this.conversationStates.values()) {
      state.activeRun?.abortController.abort('Channel message router stopping')
    }

    this.conversationStates.clear()
    this.controlChainsByConversation.clear()
  }

  async handleInboundEvent(event: ChannelMessageReceivedEvent): Promise<void> {
    const channel = await this.options.channelsRepo.getById(event.channelId)
    if (!channel?.assistantId) {
      return
    }

    const runtimeChannel = await this.options.channelsRepo.getRuntimeById(event.channelId)
    if (!runtimeChannel?.assistantId) {
      return
    }

    const assistantId = runtimeChannel.assistantId
    const conversationKey = this.getConversationKey(event.channelId, event.message.remoteChatId)
    let completionPromise: Promise<void> | null = null

    await this.runConversationControl(conversationKey, async () => {
      const threadId = await this.getOrCreateThreadId({
        channelId: event.channelId,
        assistantId,
        remoteChatId: event.message.remoteChatId
      })
      const state = this.getConversationState(conversationKey)

      if (this.isResumeCommand(event.message.content) && !state.activeRun) {
        const pausedTask = state.pausedTasks.pop()
        if (!pausedTask) {
          await this.publishReply(event, RESUME_NOT_AVAILABLE_REPLY)
          return
        }

        pausedTask.resumed = true
        state.queue.unshift(pausedTask)
        completionPromise = pausedTask.completion.promise
        await this.publishReply(event, RESUME_RECOGNIZED_REPLY)
        this.startNextConversationRun(conversationKey, state)
        return
      }

      const workItem = this.createWorkItem({
        assistantId,
        threadId,
        event
      })
      completionPromise = workItem.completion.promise

      if (state.activeRun) {
        await this.routeIncomingMessageWhileActive(state, workItem)
        return
      }

      state.queue.push(workItem)
      this.startNextConversationRun(conversationKey, state)
    })

    await (completionPromise ?? Promise.resolve())
  }

  private async publishReply(event: ChannelMessageReceivedEvent, content: string): Promise<void> {
    await this.options.eventBus.publish('channel.message.send-requested', {
      eventId: randomUUID(),
      channelId: event.channelId,
      channelType: event.channelType,
      remoteChatId: event.message.remoteChatId,
      content
    })
  }

  private async routeIncomingMessageWhileActive(
    state: ConversationExecutionState,
    workItem: InboundConversationWorkItem
  ): Promise<void> {
    const activeRun = state.activeRun
    if (!activeRun) {
      state.queue.push(workItem)
      return
    }

    const decision = await this.decideInterruption({
      activeTaskSummary: describeWorkItem(activeRun.item),
      incomingMessage: workItem.userMessage.content,
      queuedMessageCount: state.queue.length
    })

    if (decision.decision === 'interrupt') {
      if (!activeRun.isPaused) {
        state.pausedTasks.push(this.cloneWorkItemForPause(activeRun.item))
        activeRun.isPaused = true
      }

      state.queue.unshift(workItem)
      activeRun.abortController.abort('Interrupted by newer user request')
      await this.publishReply(workItem.event, decision.reason)
      return
    }

    state.queue.push(workItem)
    await this.publishReply(workItem.event, decision.reason)
  }

  private startNextConversationRun(
    conversationKey: string,
    state: ConversationExecutionState
  ): void {
    if (state.activeRun || state.queue.length === 0) {
      return
    }

    const nextItem = state.queue.shift()
    if (!nextItem) {
      return
    }

    const activeRun: ActiveConversationRun = {
      item: nextItem,
      abortController: new AbortController(),
      startedAt: Date.now(),
      isPaused: false
    }

    state.activeRun = activeRun

    void (async () => {
      await this.executeConversationWorkItem(activeRun)
      activeRun.item.completion.resolve()

      await this.runConversationControl(conversationKey, async () => {
        const latestState = this.conversationStates.get(conversationKey)
        if (!latestState) {
          return
        }

        if (latestState.activeRun === activeRun) {
          latestState.activeRun = undefined
        }

        this.startNextConversationRun(conversationKey, latestState)
        this.cleanupConversationState(conversationKey, latestState)
      })
    })()
  }

  private async executeConversationWorkItem(activeRun: ActiveConversationRun): Promise<void> {
    const { item } = activeRun

    try {
      const stream = await this.options.assistantRuntime.streamChat({
        assistantId: item.assistantId,
        threadId: item.threadId,
        profileId: DEFAULT_PROFILE_ID,
        messages: [item.userMessage],
        channelTarget: {
          channelId: item.event.channelId,
          channelType: item.event.channelType,
          remoteChatId: item.event.message.remoteChatId
        },
        abortSignal: activeRun.abortController.signal
      })

      // Drain stream and only publish user-facing tool completion updates
      const assistantReplyText = await drainStreamWithToolUpdates(stream, async (toolMessage) => {
        await this.publishReply(item.event, toolMessage)
      })

      if (activeRun.abortController.signal.aborted) {
        return
      }

      try {
        this.options.threadMessageEventsStore?.appendMessagesUpdated({
          assistantId: item.assistantId,
          threadId: item.threadId,
          profileId: DEFAULT_PROFILE_ID,
          source: 'channel'
        })
      } catch (error) {
        logger.error(
          `[ChannelMessageRouter] appendMessagesUpdated failed: ${toErrorLogMessage(error)}`
        )
      }

      if (assistantReplyText.trim().length === 0) {
        await this.publishReply(item.event, EMPTY_ASSISTANT_REPLY_MESSAGE)
      }
    } catch (error) {
      if (this.isAbortError(error) || activeRun.abortController.signal.aborted) {
        return
      }

      const rawMessage = toErrorLogMessage(error)
      logger.error(`[ChannelMessageRouter] streamChat failed: ${rawMessage}`)
      await this.publishReply(item.event, `[Error] ${toFriendlyErrorMessage(rawMessage)}`)
    }
  }

  private createWorkItem(input: {
    assistantId: string
    threadId: string
    event: ChannelMessageReceivedEvent
  }): InboundConversationWorkItem {
    return {
      assistantId: input.assistantId,
      threadId: input.threadId,
      event: input.event,
      userMessage: {
        id: `channel:${input.event.channelId}:${input.event.message.id}`,
        content: input.event.message.content,
        role: 'user',
        parts: [{ type: 'text', text: input.event.message.content }],
        metadata: {
          fromChannel: input.event.channelType,
          channelId: input.event.channelId,
          channelType: input.event.channelType,
          remoteChatId: input.event.message.remoteChatId,
          remoteMessageId: input.event.message.id,
          senderId: input.event.message.senderId,
          ...(input.event.message.metadata ?? {})
        }
      },
      completion: createWorkItemCompletion()
    }
  }

  private cloneWorkItemForPause(
    workItem: InboundConversationWorkItem
  ): InboundConversationWorkItem {
    return {
      ...workItem,
      resumed: true,
      userMessage: {
        ...workItem.userMessage,
        id: `${workItem.userMessage.id}:resume:${randomUUID()}`
      },
      completion: createWorkItemCompletion()
    }
  }

  private getConversationKey(channelId: string, remoteChatId: string): string {
    return `${channelId}:${remoteChatId}`
  }

  private getConversationState(conversationKey: string): ConversationExecutionState {
    const existing = this.conversationStates.get(conversationKey)
    if (existing) {
      return existing
    }

    const created: ConversationExecutionState = {
      queue: [],
      pausedTasks: []
    }
    this.conversationStates.set(conversationKey, created)
    return created
  }

  private cleanupConversationState(
    conversationKey: string,
    state: ConversationExecutionState
  ): void {
    if (state.activeRun || state.queue.length > 0 || state.pausedTasks.length > 0) {
      return
    }

    this.conversationStates.delete(conversationKey)
  }

  private async runConversationControl(
    conversationKey: string,
    operation: () => Promise<void>
  ): Promise<void> {
    const previous = this.controlChainsByConversation.get(conversationKey) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(operation)

    this.controlChainsByConversation.set(conversationKey, next)

    try {
      await next
    } finally {
      if (this.controlChainsByConversation.get(conversationKey) === next) {
        this.controlChainsByConversation.delete(conversationKey)
      }
    }
  }

  private async decideInterruption(
    input: InterruptionDecisionInput
  ): Promise<InterruptionDecision> {
    try {
      return (
        (await this.options.interruptionDecider?.(input)) ?? decideInterruptionHeuristically(input)
      )
    } catch (error) {
      logger.error(`[ChannelMessageRouter] interruptionDecider failed: ${toErrorLogMessage(error)}`)
      return decideInterruptionHeuristically(input)
    }
  }

  private isResumeCommand(content: string): boolean {
    return RESUME_COMMANDS.has(content.trim().toLowerCase())
  }

  private isAbortError(error: unknown): boolean {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return true
      }

      return /aborted|abort/i.test(error.message)
    }

    return false
  }

  private async getOrCreateThreadId(input: {
    channelId: string
    assistantId: string
    remoteChatId: string
  }): Promise<string> {
    const existingBinding = await this.options.bindingsRepo.getByChannelAndRemoteChat(
      input.channelId,
      input.remoteChatId
    )

    logger.debug(`[ChannelMessageRouter] existingBinding: ${JSON.stringify(existingBinding)}`)
    if (existingBinding) {
      return existingBinding.threadId
    }

    const binding = await this.createThreadBinding(input)
    return binding.threadId
  }

  private async createThreadBinding(input: {
    channelId: string
    assistantId: string
    remoteChatId: string
  }) {
    const thread = await this.options.threadsRepo.create({
      assistantId: input.assistantId,
      resourceId: DEFAULT_PROFILE_ID,
      title: DEFAULT_THREAD_TITLE
    })

    return this.options.bindingsRepo.create({
      channelId: input.channelId,
      remoteChatId: input.remoteChatId,
      threadId: thread.id
    })
  }
}
