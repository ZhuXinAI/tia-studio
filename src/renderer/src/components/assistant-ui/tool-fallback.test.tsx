import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ToolFallbackResult } from './tool-fallback'

describe('ToolFallbackResult', () => {
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
