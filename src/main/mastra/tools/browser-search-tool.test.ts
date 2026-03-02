import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browserSearchTool, buildSearchUrl, sanitizeHtmlForModel } from './browser-search-tool'

describe('browser search tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('builds provider search urls', () => {
    expect(buildSearchUrl({ query: 'pinchtab', engine: 'google' })).toBe(
      'https://www.google.com/search?q=pinchtab'
    )
    expect(buildSearchUrl({ query: 'AI news', engine: 'bing' })).toBe(
      'https://www.bing.com/search?q=AI%20news'
    )
  })

  it('removes style and script tags before conversion', () => {
    const sanitized = sanitizeHtmlForModel(
      '<style>.hide{display:none}</style><script>window.alert(1)</script><main><h1>Hello</h1></main>'
    )

    expect(sanitized).not.toContain('<style>')
    expect(sanitized).not.toContain('<script>')
    expect(sanitized).toContain('<main><h1>Hello</h1></main>')
  })

  it('converts fetched html into markdown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          '<html><head><style>.foo{color:red}</style></head><body><main><h1>AI News</h1><p>Latest update.</p></main></body></html>',
          {
            status: 200,
            headers: {
              'Content-Type': 'text/html'
            }
          }
        )
      )
    )

    if (!browserSearchTool.execute) {
      throw new Error('browser search tool execute function is not defined')
    }

    const result = await browserSearchTool.execute(
      {
        query: 'AI news',
        engine: 'google'
      },
      {} as never
    )

    if (!result || !('markdown' in result)) {
      throw new Error('Expected markdown search result output')
    }

    expect(result).toMatchObject({
      engine: 'google',
      query: 'AI news',
      url: 'https://www.google.com/search?q=AI%20news',
      truncated: false
    })
    expect(result.markdown).toContain('AI News')
    expect(result.markdown).toContain('Latest update.')
  })
})
