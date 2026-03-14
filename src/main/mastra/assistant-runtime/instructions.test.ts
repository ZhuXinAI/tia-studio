import { describe, expect, it } from 'vitest'
import { buildAssistantInstructions } from './instructions'

describe('buildAssistantInstructions', () => {
  it('adds onboarding, browser, and channel guidance when enabled', () => {
    const text = buildAssistantInstructions({
      baseInstructions: 'You are helpful.',
      currentDateTime: 'Friday, March 14, 2026, 10:00:00 AM CST',
      isFirstConversation: true,
      channelDeliveryEnabled: true,
      channelType: 'lark',
      builtInBrowserHandoffAvailable: true
    })

    expect(text).toContain('First Conversation Onboarding')
    expect(text).toContain('Use webFetch only when you already know the exact page URL')
    expect(text).toContain('TIA provides a built-in Electron browser')
    expect(text).toContain('insert [[BR]]')
  })
})
