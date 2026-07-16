import { randomUUID } from 'node:crypto'
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { AppAgentEvent, AppAgentMessage } from '../../../shared/agent-runtime'

type MappingState = {
  sequence: number
  currentMessageId?: string
}

type AppAgentEventPayload = AppAgentEvent extends infer Event
  ? Event extends AppAgentEvent
    ? Omit<Event, 'eventId' | 'sessionId' | 'sequence' | 'timestamp' | 'source'>
    : never
  : never

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export class PiSdkEventMapper {
  private readonly state: MappingState = { sequence: 0 }

  constructor(
    private readonly sessionId: string,
    private readonly now: () => Date = () => new Date(),
    initialSequence = 0
  ) {
    this.state.sequence = initialSequence
  }

  map(input: AgentSessionEvent): AppAgentEvent[] {
    const events: AppAgentEvent[] = []
    const emit = (event: AppAgentEventPayload) => {
      events.push(this.applicationEvent(event))
    }

    switch (input.type) {
      case 'agent_start':
        emit({ type: 'run.started' })
        break
      case 'agent_settled':
        emit({ type: 'run.settled' })
        break
      case 'message_start': {
        const message = object(input.message)
        if (message?.role !== 'assistant') break
        const messageId = text(message.id) ?? randomUUID()
        this.state.currentMessageId = messageId
        const started: AppAgentMessage = {
          id: messageId,
          sessionId: this.sessionId,
          role: 'assistant',
          parts: [],
          createdAt: this.now().toISOString(),
          status: 'streaming',
          upstreamId: text(message.id)
        }
        emit({ type: 'message.started', message: started })
        break
      }
      case 'message_update': {
        const delta = object(input.assistantMessageEvent)
        const messageId = this.state.currentMessageId
        if (!delta || !messageId) break
        const contentIndex = number(delta.contentIndex) ?? 0
        if (delta.type === 'text_delta' && typeof delta.delta === 'string') {
          emit({ type: 'message.text.delta', messageId, contentIndex, delta: delta.delta })
        } else if (delta.type === 'thinking_delta' && typeof delta.delta === 'string') {
          emit({ type: 'message.thinking.delta', messageId, contentIndex, delta: delta.delta })
        } else if (delta.type === 'error') {
          emit({ type: 'message.completed', messageId, status: 'error' })
        }
        break
      }
      case 'message_end': {
        if (this.state.currentMessageId) {
          const message = object(input.message)
          const status = message?.stopReason === 'error' ? 'error' : 'complete'
          emit({ type: 'message.completed', messageId: this.state.currentMessageId, status })
          this.state.currentMessageId = undefined
        }
        break
      }
      case 'tool_execution_start': {
        const toolCallId = text(input.toolCallId)
        const toolName = text(input.toolName)
        if (!toolCallId || !toolName) break
        emit({
          type: 'tool.started',
          messageId: this.state.currentMessageId,
          toolCallId,
          toolName,
          input: input.args
        })
        break
      }
      case 'tool_execution_update': {
        const toolCallId = text(input.toolCallId)
        const toolName = text(input.toolName)
        if (toolCallId && toolName) {
          emit({ type: 'tool.updated', toolCallId, toolName, output: input.partialResult })
        }
        break
      }
      case 'tool_execution_end': {
        const toolCallId = text(input.toolCallId)
        const toolName = text(input.toolName)
        if (toolCallId && toolName) {
          emit({
            type: 'tool.completed',
            toolCallId,
            toolName,
            output: input.result,
            isError: input.isError === true
          })
        }
        break
      }
      case 'queue_update':
        emit({
          type: 'queue.changed',
          steering: Array.isArray(input.steering)
            ? input.steering.filter((item): item is string => typeof item === 'string')
            : [],
          followUps: Array.isArray(input.followUp)
            ? input.followUp.filter((item): item is string => typeof item === 'string')
            : []
        })
        break
      case 'compaction_start':
        emit({ type: 'compaction.started', reason: text(input.reason) })
        break
      case 'compaction_end':
        emit({ type: 'compaction.completed', error: text(input.errorMessage) })
        break
      case 'auto_retry_start':
        emit({
          type: 'retry.started',
          attempt: number(input.attempt) ?? 1,
          maxAttempts: number(input.maxAttempts) ?? 1
        })
        break
      case 'auto_retry_end':
        emit({
          type: 'retry.completed',
          success: input.success === true,
          error: text(input.finalError)
        })
        break
      case 'agent_end':
      case 'turn_start':
      case 'turn_end':
      case 'entry_appended':
      case 'session_info_changed':
      case 'thinking_level_changed':
        break
      default: {
        const unknown = input as unknown as { type: string }
        emit({ type: 'runtime.notice', level: 'info', text: `Ignored Pi event: ${unknown.type}` })
        break
      }
    }
    return events
  }

  applicationEvent(event: AppAgentEventPayload): AppAgentEvent {
    return {
      ...event,
      eventId: randomUUID(),
      sessionId: this.sessionId,
      sequence: ++this.state.sequence,
      timestamp: this.now().toISOString(),
      source: 'pi-sdk'
    } as AppAgentEvent
  }
}
