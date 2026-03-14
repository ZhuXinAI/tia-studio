import { describe, expect, it } from 'vitest'
import {
  createStreamUsageObservation,
  normalizeUsageMetrics,
  observeStreamChunk
} from './stream-observation'

describe('stream observation helpers', () => {
  it('captures usage from finish chunks', () => {
    const observation = createStreamUsageObservation()

    observeStreamChunk(observation, {
      type: 'finish',
      messageId: 'assistant-msg-1',
      totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
    } as never)

    expect(observation.assistantMessageId).toBe('assistant-msg-1')
    expect(observation.totalUsage?.totalTokens).toBe(3)
  })

  it('normalizes string token counts into integers', () => {
    expect(
      normalizeUsageMetrics({
        inputTokens: '10',
        outputTokens: '4',
        totalTokens: '14',
        reasoningTokens: '2',
        cachedInputTokens: '1'
      })
    ).toEqual({
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
      reasoningTokens: 2,
      cachedInputTokens: 1
    })
  })
})
