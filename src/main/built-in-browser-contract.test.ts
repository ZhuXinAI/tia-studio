import { describe, expect, it } from 'vitest'
import { buildBuiltInBrowserGuidance } from './built-in-browser-contract'

describe('buildBuiltInBrowserGuidance', () => {
  it('tells assistants to send a normal message and screenshot before human handoff when possible', () => {
    const guidance = buildBuiltInBrowserGuidance({
      handoffToolAvailable: true
    })

    expect(guidance).toContain('Do not rely on hidden tool-call UI')
    expect(guidance).toContain('send the screenshot to the user first')
    expect(guidance).toContain('request-browser-human-handoff tool')
  })
})
