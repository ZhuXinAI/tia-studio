import { describe, expect, it } from 'vitest'
import type { AppAgentMessage } from '../../../../../shared/agent-runtime'
import { mergeAssistantRunMessages } from './pi-thread-message-groups'
import { resolveActiveSendBehavior } from './pi-thread-send-behavior'

function message(
  id: string,
  role: AppAgentMessage['role'],
  text: string,
  createdAt: string
): AppAgentMessage {
  return {
    id,
    sessionId: 'session-1',
    role,
    parts: [{ type: role === 'assistant' ? 'thinking' : 'text', text }],
    createdAt,
    completedAt: createdAt,
    status: 'complete'
  }
}

describe('mergeAssistantRunMessages', () => {
  it('keeps reasoning, tool work, and the final answer in one assistant turn', () => {
    const first = message('assistant-1', 'assistant', 'Checking the folder', '2026-07-18T00:00:01Z')
    first.parts.push({ type: 'text', text: "I'll check the current working directory." })
    const second = message(
      'assistant-2',
      'assistant',
      'The folder is ready',
      '2026-07-18T00:00:03Z'
    )
    const user = message('user-1', 'user', 'Which folder?', '2026-07-18T00:00:00Z')

    expect(mergeAssistantRunMessages([user, first, second])).toEqual([
      user,
      expect.objectContaining({
        id: 'assistant-1',
        parts: [
          first.parts[0],
          { type: 'thinking', text: "I'll check the current working directory." },
          ...second.parts
        ],
        createdAt: first.createdAt,
        completedAt: second.completedAt
      })
    ])
  })

  it('does not merge assistant turns separated by a user message', () => {
    const first = message('assistant-1', 'assistant', 'One', '2026-07-18T00:00:01Z')
    const user = message('user-1', 'user', 'Next', '2026-07-18T00:00:02Z')
    const second = message('assistant-2', 'assistant', 'Two', '2026-07-18T00:00:03Z')

    expect(mergeAssistantRunMessages([first, user, second])).toHaveLength(3)
  })
})

describe('resolveActiveSendBehavior', () => {
  it('queues a normal message as a follow-up when Pi is already running', () => {
    expect(resolveActiveSendBehavior('running', 'normal')).toBe('follow-up')
    expect(resolveActiveSendBehavior('running', 'follow-up')).toBe('follow-up')
  })

  it('keeps an explicit steer and idle messages unchanged', () => {
    expect(resolveActiveSendBehavior('running', 'steer')).toBe('steer')
    expect(resolveActiveSendBehavior('idle', 'follow-up')).toBe('normal')
  })
})
