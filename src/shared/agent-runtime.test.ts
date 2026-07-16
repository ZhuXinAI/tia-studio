import { describe, expect, it } from 'vitest'
import { reduceAgentEvent, type AgentSessionView, type AppAgentEvent } from './agent-runtime'

const snapshot = {
  id: 's',
  workspaceId: null,
  workspacePath: '/tmp',
  title: 'New thread',
  providerId: 'p',
  provider: 'openai',
  modelId: 'gpt-4o',
  thinkingLevel: 'medium' as const,
  accessMode: 'standard' as const,
  pinned: false,
  status: 'idle' as const,
  isCompacting: false,
  queue: { steering: [], followUps: [] },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

function event(
  payload: Omit<AppAgentEvent, 'eventId' | 'sessionId' | 'sequence' | 'timestamp' | 'source'>,
  sequence: number
): AppAgentEvent {
  return {
    ...payload,
    eventId: `e${sequence}`,
    sessionId: 's',
    sequence,
    timestamp: `2026-01-01T00:00:0${sequence}.000Z`,
    source: 'pi-sdk'
  } as AppAgentEvent
}

describe('reduceAgentEvent', () => {
  it('reconstructs streaming content and ignores duplicate events', () => {
    let view: AgentSessionView = { snapshot, messages: [], seenEventIds: [], lastSequence: 0 }
    view = reduceAgentEvent(
      view,
      event(
        {
          type: 'message.started',
          message: {
            id: 'm',
            sessionId: 's',
            role: 'assistant',
            parts: [],
            status: 'streaming',
            createdAt: snapshot.createdAt
          }
        },
        1
      )
    )
    const delta = event(
      { type: 'message.text.delta', messageId: 'm', contentIndex: 0, delta: 'Hi' },
      2
    )
    view = reduceAgentEvent(view, delta)
    view = reduceAgentEvent(view, delta)
    expect(view.messages[0]?.parts).toEqual([{ type: 'text', text: 'Hi' }])
  })

  it('tracks and clears pending interactions', () => {
    let view: AgentSessionView = { snapshot, messages: [], seenEventIds: [], lastSequence: 0 }
    view = reduceAgentEvent(
      view,
      event(
        {
          type: 'interaction.requested',
          request: {
            id: 'i',
            method: 'confirm',
            title: 'Allow?',
            message: 'Risky'
          }
        },
        1
      )
    )
    expect(view.snapshot.pendingInteraction?.id).toBe('i')
    view = reduceAgentEvent(view, event({ type: 'interaction.resolved', interactionId: 'i' }, 2))
    expect(view.snapshot.pendingInteraction).toBeUndefined()
  })

  it('applies session metadata updates published by runtime tools', () => {
    const view: AgentSessionView = { snapshot, messages: [], seenEventIds: [], lastSequence: 0 }
    const updated = reduceAgentEvent(
      view,
      event({ type: 'session.updated', snapshot: { ...snapshot, title: 'Fix startup retry' } }, 1)
    )

    expect(updated.snapshot.title).toBe('Fix startup retry')
  })
})
