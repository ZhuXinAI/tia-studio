import { describe, expect, it } from 'vitest'
import type { AppAgentMessage } from '../../../../../shared/agent-runtime'
import {
  createOptimisticUserMessage,
  reconcileOptimisticUserMessages,
  settleOptimisticUserMessage
} from './pi-thread-optimistic-messages'

const content = {
  text: '  hello  ',
  attachments: []
}

function canonicalMessage(id: string, createdAt: string): AppAgentMessage {
  return {
    id,
    sessionId: 'session-1',
    role: 'user',
    parts: [{ type: 'text', text: 'hello' }],
    createdAt,
    status: 'complete'
  }
}

describe('optimistic user messages', () => {
  it('creates a message that is immediately renderable', () => {
    const optimistic = createOptimisticUserMessage(
      'session-1',
      content,
      new Date('2026-08-01T00:00:00.000Z')
    )

    expect(optimistic.message).toMatchObject({
      sessionId: 'session-1',
      role: 'user',
      parts: [{ type: 'text', text: 'hello' }],
      status: 'complete'
    })
    expect(optimistic.message.id).toMatch(/^optimistic-/)
  })

  it('removes the temporary message when the canonical event arrives', () => {
    const optimistic = createOptimisticUserMessage(
      'session-1',
      content,
      new Date('2026-08-01T00:00:00.000Z')
    )
    const canonical = canonicalMessage('server-message-1', '2026-08-01T00:00:00.100Z')

    expect(
      settleOptimisticUserMessage([optimistic.message, canonical], [optimistic], canonical)
    ).toEqual({ messages: [canonical], pending: [] })
  })

  it('does not resolve a new duplicate message to an older history item', () => {
    const optimistic = createOptimisticUserMessage(
      'session-1',
      content,
      new Date('2026-08-01T00:00:01.000Z')
    )
    const older = canonicalMessage('older-message', '2026-08-01T00:00:00.000Z')

    expect(reconcileOptimisticUserMessages([older, optimistic.message], [optimistic])).toEqual({
      messages: [older, optimistic.message],
      pending: [optimistic]
    })
  })
})
