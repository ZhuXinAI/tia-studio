import { describe, expect, it } from 'vitest'
import { shouldShowUserMessagePending } from './user-message-pending'

describe('shouldShowUserMessagePending', () => {
  it('hides the pending row once the following assistant message is complete', () => {
    expect(
      shouldShowUserMessagePending({
        threadRunning: true,
        isLastMessage: false,
        nextMessageRole: 'assistant',
        nextMessageRunning: false
      })
    ).toBe(false)
  })

  it('shows the pending row while the following assistant message is streaming', () => {
    expect(
      shouldShowUserMessagePending({
        threadRunning: true,
        isLastMessage: false,
        nextMessageRole: 'assistant',
        nextMessageRunning: true
      })
    ).toBe(true)
  })
})
