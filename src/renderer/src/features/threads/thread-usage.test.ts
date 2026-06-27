import { describe, expect, it } from 'vitest'
import { deriveThreadUsageFromMessages, extractThreadMessageUsage } from './thread-usage'

describe('thread usage helpers', () => {
  it('parses assistant usage metadata when present', () => {
    expect(
      extractThreadMessageUsage({
        usage: {
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
          reasoningTokens: 9,
          cachedInputTokens: 18
        }
      })
    ).toEqual({
      inputTokens: 120,
      outputTokens: 45,
      totalTokens: 165,
      reasoningTokens: 9,
      cachedInputTokens: 18
    })
  })

  it('derives aggregate thread totals from assistant messages when persisted totals are unavailable', () => {
    expect(
      deriveThreadUsageFromMessages([
        {
          id: 'message-user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }]
        },
        {
          id: 'message-assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hi there' }],
          metadata: {
            usage: {
              inputTokens: 100,
              outputTokens: 20,
              totalTokens: 120,
              reasoningTokens: 0,
              cachedInputTokens: 0
            }
          }
        },
        {
          id: 'message-assistant-2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'How can I help?' }],
          metadata: {
            usage: {
              inputTokens: 80,
              outputTokens: 55,
              totalTokens: 135,
              reasoningTokens: 10,
              cachedInputTokens: 25
            }
          }
        }
      ])
    ).toEqual({
      assistantMessageCount: 2,
      inputTokens: 180,
      outputTokens: 75,
      totalTokens: 255,
      reasoningTokens: 10,
      cachedInputTokens: 25
    })
  })
})
