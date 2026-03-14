import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ToolFallbackResult } from './tool-fallback'

describe('ToolFallbackResult', () => {
  it('renders delegated team-member results with teammate context', () => {
    const html = renderToString(
      <ToolFallbackResult
        result={{
          kind: 'team-member-result',
          assistantId: 'assistant-1',
          assistantName: 'Researcher',
          task: 'Check the factual risks in the rollout plan.',
          text: 'I verified the risky claims and noted the missing source links.',
          mentions: ['assistant-2'],
          mentionNames: ['Planner'],
          subAgentThreadId: 'thread-1',
          subAgentResourceId: 'profile-1'
        }}
      />
    )

    expect(html).toContain('Delegated response:')
    expect(html).toContain('Researcher')
    expect(html).toContain('Check the factual risks in the rollout plan.')
    expect(html).toContain('I verified the risky claims and noted the missing source links.')
    expect(html).toContain('Suggested next:')
    expect(html).toContain('Planner')
    expect(html).toContain('Routing hints')
  })

  it('falls back to JSON rendering for generic tool results', () => {
    const html = renderToString(
      <ToolFallbackResult
        result={{
          status: 'ok',
          count: 2
        }}
      />
    )

    expect(html).toContain('Result:')
    expect(html).toContain('&quot;status&quot;: &quot;ok&quot;')
    expect(html).toContain('&quot;count&quot;: 2')
  })
})
