import { describe, expect, it, vi } from 'vitest'
import { buildScheduledRunMessages } from './scheduled-runs'

const { toAISdkV5MessagesMock } = vi.hoisted(() => ({
  toAISdkV5MessagesMock: vi.fn((messages: unknown) => messages)
}))

vi.mock('@mastra/ai-sdk/ui', () => ({
  toAISdkV5Messages: (messages: unknown) => toAISdkV5MessagesMock(messages)
}))

describe('buildScheduledRunMessages', () => {
  it('prepends cron execution guidance to scheduled cron prompts', () => {
    const messages = buildScheduledRunMessages({
      kind: 'cron',
      threadId: 'thread-1',
      prompt: 'Remind me to ship the release.'
    })

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      role: 'user'
    })
    expect(messages[0]?.content).toContain('CRON JOB EXECUTION')
    expect(messages[0]?.content).toContain('DO NOT create new cron jobs')
    expect(messages[0]?.content).toContain('TASK TO EXECUTE NOW:')
    expect(messages[0]?.content).toContain('Remind me to ship the release.')
  })
})
