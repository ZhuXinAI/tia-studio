import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSearchUrl,
  createBrowserSearchTool,
  sanitizeHtmlForModel
} from './browser-search-tool'

describe('browser search tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('builds provider search urls', () => {
    expect(buildSearchUrl({ query: 'pinchtab', engine: 'google' })).toBe(
      'https://www.google.com/search?q=pinchtab'
    )
    expect(buildSearchUrl({ query: 'AI news', engine: 'bing' })).toBe(
      'https://www.bing.com/search?q=AI%20news'
    )
    expect(buildSearchUrl({ query: 'AI news', engine: 'baidu' })).toBe(
      'https://www.baidu.com/s?wd=AI%20news'
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

  it('uses configured browser window options when loading html', async () => {
    const loadHtmlFromUrl = vi.fn(
      async () =>
        '<html><head><style>.foo{color:red}</style></head><body><main><h1>AI News</h1><p>Latest update.</p></main></body></html>'
    )

    const searchTool = createBrowserSearchTool({
      resolveDefaultEngine: async () => 'bing' as const,
      resolveKeepBrowserWindowOpen: async () => false,
      loadHtmlFromUrl
    })

    if (!searchTool.execute) {
      throw new Error('browser search tool execute function is not defined')
    }

    const result = await searchTool.execute(
      {
        action: 'search',
        query: 'AI news'
      },
      {} as never
    )

    if (!result || typeof result !== 'object' || !('markdown' in result)) {
      throw new Error('Expected markdown search result output')
    }

    expect(result).toMatchObject({
      engine: 'bing',
      query: 'AI news',
      url: 'https://www.bing.com/search?q=AI%20news',
      truncated: false
    })
    expect(loadHtmlFromUrl).toHaveBeenCalledWith({
      url: 'https://www.bing.com/search?q=AI%20news',
      keepBrowserWindowOpen: false
    })
    expect(result.markdown).toContain('AI News')
    expect(result.markdown).toContain('Latest update.')
  })

  it('falls back to built-in defaults when resolvers fail', async () => {
    const loadHtmlFromUrl = vi.fn(async () => '<main><h1>AI News</h1></main>')
    const searchTool = createBrowserSearchTool({
      resolveDefaultEngine: async () => {
        throw new Error('oops')
      },
      resolveKeepBrowserWindowOpen: async () => {
        throw new Error('oops')
      },
      loadHtmlFromUrl
    })

    if (!searchTool.execute) {
      throw new Error('browser search tool execute function is not defined')
    }

    const result = await searchTool.execute(
      {
        action: 'search',
        query: 'AI news'
      },
      {} as never
    )

    if (!result || typeof result !== 'object' || !('url' in result)) {
      throw new Error('Expected url in search output')
    }

    expect(result.url).toContain('https://www.bing.com/search?q=AI%20news')
    expect(loadHtmlFromUrl).toHaveBeenCalledWith({
      url: 'https://www.bing.com/search?q=AI%20news',
      keepBrowserWindowOpen: true
    })
  })
})
