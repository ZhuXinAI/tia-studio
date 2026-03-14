import { createTool, type Tool } from '@mastra/core/tools'
import { BrowserWindow } from 'electron'
import { htmlToMarkdown } from 'mdream'
import { withMinimalPreset } from 'mdream/preset/minimal'
import { z } from 'zod'

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

const webFetchInputSchema = z.object({
  url: z.string().url()
})

const webFetchOutputSchema = z.object({
  url: z.string().url(),
  markdown: z.string(),
  truncated: z.boolean()
})

type WebFetchToolOptions = {
  resolveKeepBrowserWindowOpen?: () => boolean | Promise<boolean>
  resolveShowBrowser?: () => boolean | Promise<boolean>
  loadHtmlFromUrl?: (input: {
    url: string
    keepBrowserWindowOpen: boolean
    showBrowser: boolean
  }) => Promise<string>
}

let sharedWebFetchWindow: BrowserWindow | null = null

export type WebFetchInput = z.infer<typeof webFetchInputSchema>

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

function normalizeKeepBrowserWindowOpen(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultKeepBrowserWindowOpen
}

async function resolveKeepBrowserWindowOpen(
  resolver?: WebFetchToolOptions['resolveKeepBrowserWindowOpen']
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
  resolver?: WebFetchToolOptions['resolveShowBrowser']
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

function createWebFetchWindow(showBrowser: boolean): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: showBrowser,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: 'persist:tia-web-fetch'
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return window
}

function resolveWebFetchWindow(
  keepBrowserWindowOpen: boolean,
  showBrowser: boolean
): BrowserWindow {
  if (keepBrowserWindowOpen && sharedWebFetchWindow && !sharedWebFetchWindow.isDestroyed()) {
    return sharedWebFetchWindow
  }

  const window = createWebFetchWindow(showBrowser)
  if (keepBrowserWindowOpen) {
    sharedWebFetchWindow = window
    window.once('closed', () => {
      if (sharedWebFetchWindow === window) {
        sharedWebFetchWindow = null
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
    throw new Error(`Web fetch request failed with status ${response.status}`)
  }

  return response.text()
}

async function loadHtmlWithBrowserWindow(input: {
  url: string
  keepBrowserWindowOpen: boolean
  showBrowser: boolean
}): Promise<string> {
  const window = resolveWebFetchWindow(input.keepBrowserWindowOpen, input.showBrowser)
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
      throw new Error('Web fetch window returned empty HTML')
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

export function createWebFetchTool(
  options?: WebFetchToolOptions
): Tool<WebFetchInput, z.infer<typeof webFetchOutputSchema>> {
  return createTool({
    id: 'web-fetch',
    description:
      'Fetch a specific URL and return markdown converted from the HTML. Use this only when you already know the page URL.',
    inputSchema: webFetchInputSchema,
    outputSchema: webFetchOutputSchema,
    execute: async (input) => {
      const parsedInput = webFetchInputSchema.parse(input)
      const keepBrowserWindowOpen = await resolveKeepBrowserWindowOpen(
        options?.resolveKeepBrowserWindowOpen
      )
      const showBrowser = await resolveShowBrowser(options?.resolveShowBrowser)

      const html = await (options?.loadHtmlFromUrl ?? loadHtmlFromUrl)({
        url: parsedInput.url,
        keepBrowserWindowOpen,
        showBrowser
      })
      const sanitizedHtml = sanitizeHtmlForModel(html)
      const markdown = htmlToMarkdown(
        sanitizedHtml,
        withMinimalPreset({
          origin: parsedInput.url
        })
      )

      const normalizedMarkdown = markdown.replace(/\n{3,}/g, '\n\n')
      const clamped = clampMarkdown(normalizedMarkdown)

      return {
        url: parsedInput.url,
        markdown: clamped.markdown,
        truncated: clamped.truncated
      }
    }
  })
}

export const webFetchTool = createWebFetchTool()
