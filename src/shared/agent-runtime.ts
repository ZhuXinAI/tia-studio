export type AgentSessionId = string
export type AgentMessageId = string
export type AgentToolCallId = string

export type AgentThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type AgentAccessMode = 'standard' | 'full'
export type AgentTodoItem = {
  id: string
  title: string
  detail?: string
  status: 'pending' | 'in_progress' | 'completed'
}
export type AgentSendBehavior = 'normal' | 'steer' | 'follow-up'
export type AgentSessionStatus =
  | 'starting'
  | 'idle'
  | 'running'
  | 'recovering'
  | 'error'
  | 'stopped'

export type AgentAttachment = {
  id: string
  type: 'image'
  name: string
  mimeType: string
  size: number
  data: string
}

export type AgentTextPart = { type: 'text'; text: string }
export type AgentThinkingPart = { type: 'thinking'; text: string }
export type AgentImagePart = {
  type: 'image'
  attachmentId: string
  name: string
  mimeType: string
  data: string
}
export type AgentToolPart = {
  type: 'tool'
  toolCallId: AgentToolCallId
  toolName: string
  input: unknown
  output?: unknown
  status: 'running' | 'complete' | 'error'
}
export type AgentNoticePart = {
  type: 'notice'
  level: 'info' | 'warning' | 'error'
  text: string
}
export type AgentMessagePart =
  | AgentTextPart
  | AgentThinkingPart
  | AgentImagePart
  | AgentToolPart
  | AgentNoticePart

export type AppAgentMessage = {
  id: AgentMessageId
  sessionId: AgentSessionId
  role: 'user' | 'assistant' | 'system'
  parts: AgentMessagePart[]
  createdAt: string
  completedAt?: string
  status: 'streaming' | 'complete' | 'error'
  error?: string
  upstreamId?: string
}

export type AgentInteractionRequest =
  | {
      id: string
      method: 'confirm'
      title: string
      message: string
      timeout?: number
    }
  | {
      id: string
      method: 'select'
      title: string
      options: string[]
      timeout?: number
    }
  | {
      id: string
      method: 'input'
      title: string
      placeholder?: string
      timeout?: number
    }
  | {
      id: string
      method: 'editor'
      title: string
      prefill?: string
    }
  | {
      id: string
      method: 'permission'
      title: string
      message: string
      command: string
      workspacePath: string
      reusable: boolean
      proposedPrefixes: string[]
      nonReusableReason?: string
    }

export type AgentPermissionOutcome = 'deny' | 'allow-once' | 'allow-session' | 'allow-workspace'

export type AgentInteractionResponse =
  | { id: string; value: string }
  | { id: string; confirmed: boolean }
  | { id: string; permissionOutcome: AgentPermissionOutcome }
  | { id: string; cancelled: true }

export type AgentSessionSnapshot = {
  id: AgentSessionId
  automationId?: string
  upstreamSessionId?: string
  upstreamSessionFile?: string
  workspaceId: string | null
  workspacePath: string
  title: string
  providerId: string
  provider: string
  modelId: string
  thinkingLevel: AgentThinkingLevel
  accessMode: AgentAccessMode
  pinned: boolean
  status: AgentSessionStatus
  isCompacting: boolean
  queue: { steering: string[]; followUps: string[] }
  todos: AgentTodoItem[]
  pendingInteraction?: AgentInteractionRequest
  createdAt: string
  updatedAt: string
}

export type AgentEventSource = 'pi-sdk'

export type AgentEventBase = {
  eventId: string
  sessionId: AgentSessionId
  sequence: number
  timestamp: string
  source: AgentEventSource
}

export type AppAgentEvent =
  | (AgentEventBase & { type: 'session.started'; snapshot: AgentSessionSnapshot })
  | (AgentEventBase & { type: 'session.updated'; snapshot: AgentSessionSnapshot })
  | (AgentEventBase & { type: 'session.state'; status: AgentSessionStatus })
  | (AgentEventBase & { type: 'run.started' })
  | (AgentEventBase & { type: 'run.settled' })
  | (AgentEventBase & { type: 'run.failed'; error: string })
  | (AgentEventBase & { type: 'message.started'; message: AppAgentMessage })
  | (AgentEventBase & {
      type: 'message.text.delta'
      messageId: AgentMessageId
      contentIndex: number
      delta: string
    })
  | (AgentEventBase & {
      type: 'message.thinking.delta'
      messageId: AgentMessageId
      contentIndex: number
      delta: string
    })
  | (AgentEventBase & {
      type: 'message.completed'
      messageId: AgentMessageId
      status: 'complete' | 'error'
    })
  | (AgentEventBase & {
      type: 'tool.started'
      messageId?: AgentMessageId
      toolCallId: AgentToolCallId
      toolName: string
      input: unknown
    })
  | (AgentEventBase & {
      type: 'tool.updated'
      toolCallId: AgentToolCallId
      toolName: string
      output: unknown
    })
  | (AgentEventBase & {
      type: 'tool.completed'
      toolCallId: AgentToolCallId
      toolName: string
      output: unknown
      isError: boolean
    })
  | (AgentEventBase & {
      type: 'queue.changed'
      steering: string[]
      followUps: string[]
    })
  | (AgentEventBase & { type: 'compaction.started'; reason?: string })
  | (AgentEventBase & { type: 'compaction.completed'; error?: string })
  | (AgentEventBase & { type: 'retry.started'; attempt: number; maxAttempts: number })
  | (AgentEventBase & { type: 'retry.completed'; success: boolean; error?: string })
  | (AgentEventBase & { type: 'interaction.requested'; request: AgentInteractionRequest })
  | (AgentEventBase & { type: 'interaction.resolved'; interactionId: string })
  | (AgentEventBase & { type: 'runtime.notice'; level: 'info' | 'warning' | 'error'; text: string })

export type AgentCommandReceipt = {
  commandId: string
  accepted: boolean
  behavior?: AgentSendBehavior
  error?: string
}

export type CreateAgentSessionInput = {
  automationId?: string
  workspaceId: string | null
  workspacePath: string
  title?: string
  providerId: string
  provider: string
  modelId: string
  thinkingLevel?: AgentThinkingLevel
  accessMode?: AgentAccessMode
}

export type SendAgentMessageInput = {
  sessionId: AgentSessionId
  text: string
  attachments?: AgentAttachment[]
  behavior: AgentSendBehavior
}

export interface AppAgentRuntime {
  createSession(input: CreateAgentSessionInput): Promise<AgentSessionSnapshot>
  resumeSession(sessionId: AgentSessionId): Promise<AgentSessionSnapshot>
  closeSession(sessionId: AgentSessionId): Promise<void>
  sendMessage(input: SendAgentMessageInput): Promise<AgentCommandReceipt>
  cancelRun(sessionId: AgentSessionId): Promise<void>
  setModel(
    sessionId: AgentSessionId,
    providerId: string,
    provider: string,
    modelId: string
  ): Promise<void>
  setThinkingLevel(sessionId: AgentSessionId, level: AgentThinkingLevel): Promise<void>
  setAccessMode(sessionId: AgentSessionId, mode: AgentAccessMode): Promise<void>
  renameSession(sessionId: AgentSessionId, title: string): Promise<void>
  getSession(sessionId: AgentSessionId): Promise<AgentSessionSnapshot>
  getMessages(sessionId: AgentSessionId): Promise<AppAgentMessage[]>
  respondToInteraction(sessionId: AgentSessionId, response: AgentInteractionResponse): Promise<void>
  subscribe(sessionId: AgentSessionId, listener: (event: AppAgentEvent) => void): () => void
}

export type AgentSessionView = {
  snapshot: AgentSessionSnapshot
  messages: AppAgentMessage[]
  seenEventIds: string[]
  lastSequence: number
}

function appendToIndexedPart(
  parts: AgentMessagePart[],
  contentIndex: number,
  type: 'text' | 'thinking',
  delta: string
): AgentMessagePart[] {
  const next = [...parts]
  const existing = next[contentIndex]
  const key = type === 'text' ? 'text' : 'text'
  if (existing?.type === type) {
    next[contentIndex] = { ...existing, [key]: existing.text + delta }
  } else {
    next[contentIndex] = { type, text: delta }
  }
  return next
}

export function reduceAgentEvent(view: AgentSessionView, event: AppAgentEvent): AgentSessionView {
  if (view.seenEventIds.includes(event.eventId) || event.sequence <= view.lastSequence) {
    return view
  }

  const messages = [...view.messages]
  const updateMessage = (
    id: string,
    update: (message: AppAgentMessage) => AppAgentMessage
  ): void => {
    const index = messages.findIndex((message) => message.id === id)
    if (index >= 0) messages[index] = update(messages[index])
  }

  let snapshot = { ...view.snapshot, updatedAt: event.timestamp }
  switch (event.type) {
    case 'session.started':
    case 'session.updated':
      snapshot = event.snapshot
      break
    case 'session.state':
      snapshot.status = event.status
      break
    case 'run.started':
      snapshot.status = 'running'
      break
    case 'run.settled':
      snapshot.status = 'idle'
      break
    case 'run.failed':
      snapshot.status = 'error'
      {
        const latestStreamingAssistantIndex = messages.findLastIndex(
          (message) => message.role === 'assistant' && message.status === 'streaming'
        )
        if (latestStreamingAssistantIndex >= 0) {
          messages[latestStreamingAssistantIndex] = {
            ...messages[latestStreamingAssistantIndex],
            status: 'error',
            error: event.error,
            completedAt: event.timestamp
          }
        } else {
          messages.push({
            id: `run-failed-${event.eventId}`,
            sessionId: event.sessionId,
            role: 'assistant',
            parts: [],
            createdAt: event.timestamp,
            completedAt: event.timestamp,
            status: 'error',
            error: event.error
          })
        }
      }
      break
    case 'message.started':
      if (!messages.some((message) => message.id === event.message.id)) messages.push(event.message)
      break
    case 'message.text.delta':
      updateMessage(event.messageId, (message) => ({
        ...message,
        parts: appendToIndexedPart(message.parts, event.contentIndex, 'text', event.delta)
      }))
      break
    case 'message.thinking.delta':
      updateMessage(event.messageId, (message) => ({
        ...message,
        parts: appendToIndexedPart(message.parts, event.contentIndex, 'thinking', event.delta)
      }))
      break
    case 'message.completed':
      updateMessage(event.messageId, (message) => ({
        ...message,
        status: event.status,
        completedAt: event.timestamp
      }))
      break
    case 'tool.started': {
      const messageId = event.messageId ?? messages.at(-1)?.id
      if (messageId) {
        updateMessage(messageId, (message) => ({
          ...message,
          parts: [
            ...message.parts,
            {
              type: 'tool',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.input,
              status: 'running'
            }
          ]
        }))
      }
      break
    }
    case 'tool.updated':
    case 'tool.completed':
      for (let index = 0; index < messages.length; index += 1) {
        messages[index] = {
          ...messages[index],
          parts: messages[index].parts.map((part) =>
            part.type === 'tool' && part.toolCallId === event.toolCallId
              ? {
                  ...part,
                  output: event.output,
                  status:
                    event.type === 'tool.updated' ? 'running' : event.isError ? 'error' : 'complete'
                }
              : part
          )
        }
      }
      break
    case 'queue.changed':
      snapshot.queue = { steering: event.steering, followUps: event.followUps }
      break
    case 'compaction.started':
      snapshot.isCompacting = true
      break
    case 'compaction.completed':
      snapshot.isCompacting = false
      break
    case 'interaction.requested':
      snapshot.pendingInteraction = event.request
      break
    case 'interaction.resolved':
      if (snapshot.pendingInteraction?.id === event.interactionId) {
        delete snapshot.pendingInteraction
      }
      break
    default:
      break
  }

  return {
    snapshot,
    messages,
    seenEventIds: [...view.seenEventIds, event.eventId].slice(-2_000),
    lastSequence: event.sequence
  }
}
