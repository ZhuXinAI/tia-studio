import { createTool, type Tool } from '@mastra/core/tools'
import { BrowserWindow } from 'electron'
import { htmlToMarkdown } from 'mdream'
import { withMinimalPreset } from 'mdream/preset/minimal'
import { z } from 'zod'
import {
  defaultWebSearchEngine,
  isWebSearchEngine,
  webSearchEngines,
  type WebSearchEngine
} from '../../web-search/web-search-engine'

const maxMarkdownLength = 16_000
const defaultKeepBrowserWindowOpen = true
const defaultShowBrowser = false
const defaultRequestHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}
const extractDocumentHtmlScript = `
  (() => {
    const root = document.documentElement
    if (!root) {
      return document.body?.outerHTML ?? ''
    }
    return root.outerHTML
  })()
`

const searchToolInputSchema = z
  .object({
    action: z.enum(['search', 'visit']).default('search'),
    query: z.string().min(1, 'Query is required'),
    url: z.string().url().optional()
  })
  .refine(
    (data) => {
      if (data.action === 'visit') {
        return !!data.url
      }
      return true
    },
    {
      message: 'URL is required when action is "visit"',
      path: ['url']
    }
  )

const searchToolOutputSchema = z.object({
  engine: z.enum(webSearchEngines),
  query: z.string(),
  url: z.string().url(),
  markdown: z.string(),
  truncated: z.boolean()
})

type BrowserSearchToolOptions = {
  resolveDefaultEngine?: () => WebSearchEngine | Promise<WebSearchEngine>
  resolveKeepBrowserWindowOpen?: () => boolean | Promise<boolean>
  resolveShowBrowser?: () => boolean | Promise<boolean>
  loadHtmlFromUrl?: (input: { url: string; keepBrowserWindowOpen: boolean }) => Promise<string>
}

let sharedSearchWindow: BrowserWindow | null = null

export type BrowserSearchInput = z.infer<typeof searchToolInputSchema>

export function buildSearchUrl(input: { query: string; engine: WebSearchEngine }): string {
  const query = input.query.trim()
  const encodedQuery = encodeURIComponent(query)

  if (input.engine === 'bing') {
    return `https://www.bing.com/search?q=${encodedQuery}`
  }

  if (input.engine === 'baidu') {
    return `https://www.baidu.com/s?wd=${encodedQuery}`
  }

  return `https://www.google.com/search?q=${encodedQuery}`
}

export function sanitizeHtmlForModel(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
}

function clampMarkdown(markdown: string): {
  markdown: string
  truncated: boolean
} {
  const normalizedMarkdown = markdown.trim()
  if (normalizedMarkdown.length <= maxMarkdownLength) {
    return {
      markdown: normalizedMarkdown,
      truncated: false
    }
  }

  return {
    markdown: `${normalizedMarkdown.slice(0, maxMarkdownLength)}\n\n[truncated]`,
    truncated: true
  }
}

async function resolveDefaultSearchEngine(
  resolver?: BrowserSearchToolOptions['resolveDefaultEngine']
): Promise<WebSearchEngine> {
  if (!resolver) {
    return defaultWebSearchEngine
  }

  try {
    const resolved = await resolver()
    if (isWebSearchEngine(resolved)) {
      return resolved
    }
  } catch {
    // fall back to default engine
  }

  return defaultWebSearchEngine
}

function normalizeKeepBrowserWindowOpen(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultKeepBrowserWindowOpen
}

async function resolveKeepBrowserWindowOpen(
  resolver?: BrowserSearchToolOptions['resolveKeepBrowserWindowOpen']
): Promise<boolean> {
  if (!resolver) {
    return defaultKeepBrowserWindowOpen
  }

  try {
    return normalizeKeepBrowserWindowOpen(await resolver())
  } catch {
    return defaultKeepBrowserWindowOpen
  }
}

function normalizeShowBrowser(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultShowBrowser
}

async function resolveShowBrowser(
  resolver?: BrowserSearchToolOptions['resolveShowBrowser']
): Promise<boolean> {
  if (!resolver) {
    return defaultShowBrowser
  }

  try {
    return normalizeShowBrowser(await resolver())
  } catch {
    return defaultShowBrowser
  }
}

function createSearchWindow(showBrowser: boolean): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: showBrowser,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: 'persist:tia-browser-search'
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return window
}

function resolveSearchWindow(keepBrowserWindowOpen: boolean, showBrowser: boolean): BrowserWindow {
  if (keepBrowserWindowOpen && sharedSearchWindow && !sharedSearchWindow.isDestroyed()) {
    return sharedSearchWindow
  }

  const window = createSearchWindow(showBrowser)
  if (keepBrowserWindowOpen) {
    sharedSearchWindow = window
    window.once('closed', () => {
      if (sharedSearchWindow === window) {
        sharedSearchWindow = null
      }
    })
  }

  return window
}

function toExtraHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
}

async function loadHtmlViaFetch(url: string): Promise<string> {
  const response = await fetch(url, {
    method: 'GET',
    headers: defaultRequestHeaders
  })

  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}`)
  }

  return response.text()
}

async function loadHtmlWithBrowserWindow(input: {
  url: string
  keepBrowserWindowOpen: boolean
  showBrowser: boolean
}): Promise<string> {
  const window = resolveSearchWindow(input.keepBrowserWindowOpen, input.showBrowser)
  const shouldCloseWindowAfterUse = !input.keepBrowserWindowOpen

  try {
    await window.loadURL(input.url, {
      userAgent: defaultRequestHeaders['User-Agent'],
      extraHeaders: toExtraHeaders({
        Accept: defaultRequestHeaders.Accept
      })
    })

    const html = await window.webContents.executeJavaScript(extractDocumentHtmlScript, true)
    if (typeof html !== 'string' || html.trim().length === 0) {
      throw new Error('Search window returned empty HTML')
    }

    return html
  } finally {
    if (shouldCloseWindowAfterUse && !window.isDestroyed()) {
      window.close()
    }
  }
}

async function loadHtmlFromUrl(input: {
  url: string
  keepBrowserWindowOpen: boolean
  showBrowser: boolean
}): Promise<string> {
  if (typeof BrowserWindow !== 'function') {
    return loadHtmlViaFetch(input.url)
  }

  return loadHtmlWithBrowserWindow(input)
}

export function createBrowserSearchTool(
  options?: BrowserSearchToolOptions
): Tool<BrowserSearchInput, z.infer<typeof searchToolOutputSchema>> {
  return createTool({
    id: 'browser-search',
    description:
      'Search the web or visit a specific URL and return markdown converted from the HTML. Use action="search" to search with the configured engine, or action="visit" to directly visit a URL.',
    inputSchema: searchToolInputSchema,
    outputSchema: searchToolOutputSchema,
    execute: async (input) => {
      const parsedInput = searchToolInputSchema.parse(input)
      const engine = await resolveDefaultSearchEngine(options?.resolveDefaultEngine)
      const keepBrowserWindowOpen = await resolveKeepBrowserWindowOpen(
        options?.resolveKeepBrowserWindowOpen
      )
      const showBrowser = await resolveShowBrowser(options?.resolveShowBrowser)

      const url =
        parsedInput.action === 'visit'
          ? parsedInput.url!
          : buildSearchUrl({
              query: parsedInput.query,
              engine
            })

      const html = await (options?.loadHtmlFromUrl ?? loadHtmlFromUrl)({
        url,
        keepBrowserWindowOpen,
        showBrowser
      })
      const sanitizedHtml = sanitizeHtmlForModel(html)
      const markdown = htmlToMarkdown(
        sanitizedHtml,
        withMinimalPreset({
          origin: url
        })
      )

      const normalizedMarkdown = markdown.replace(/\n{3,}/g, '\n\n')
      const clamped = clampMarkdown(normalizedMarkdown)

      return {
        engine,
        query: parsedInput.query,
        url,
        markdown: clamped.markdown,
        truncated: clamped.truncated
      }
    }
  })
}

export const browserSearchTool = createBrowserSearchTool()
