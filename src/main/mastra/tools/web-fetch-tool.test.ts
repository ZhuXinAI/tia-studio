import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebFetchTool, sanitizeHtmlForModel } from './web-fetch-tool'

vi.mock('electron', () => ({
  BrowserWindow: undefined
}))

describe('web fetch tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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

    const webFetchTool = createWebFetchTool({
      resolveKeepBrowserWindowOpen: async () => false,
      loadHtmlFromUrl
    })

    if (!webFetchTool.execute) {
      throw new Error('web fetch tool execute function is not defined')
    }

    const result = await webFetchTool.execute(
      {
        url: 'https://example.com/ai-news'
      },
      {} as never
    )

    if (!result || typeof result !== 'object' || !('markdown' in result)) {
      throw new Error('Expected markdown web fetch output')
    }

    expect(result).toMatchObject({
      url: 'https://example.com/ai-news',
      truncated: false
    })
    expect(loadHtmlFromUrl).toHaveBeenCalledWith({
      url: 'https://example.com/ai-news',
      keepBrowserWindowOpen: false,
      showBrowser: false
    })
    expect(result.markdown).toContain('AI News')
    expect(result.markdown).toContain('Latest update.')
  })

  it('falls back to built-in defaults when resolvers fail', async () => {
    const loadHtmlFromUrl = vi.fn(async () => '<main><h1>AI News</h1></main>')
    const webFetchTool = createWebFetchTool({
      resolveKeepBrowserWindowOpen: async () => {
        throw new Error('oops')
      },
      loadHtmlFromUrl
    })

    if (!webFetchTool.execute) {
      throw new Error('web fetch tool execute function is not defined')
    }

    const result = await webFetchTool.execute(
      {
        url: 'https://example.com/ai-news'
      },
      {} as never
    )

    if (!result || typeof result !== 'object' || !('url' in result)) {
      throw new Error('Expected url in web fetch output')
    }

    expect(result.url).toContain('https://example.com/ai-news')
    expect(loadHtmlFromUrl).toHaveBeenCalledWith({
      url: 'https://example.com/ai-news',
      keepBrowserWindowOpen: true,
      showBrowser: false
    })
  })
})
