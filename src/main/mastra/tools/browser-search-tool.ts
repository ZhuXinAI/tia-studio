import { createTool } from '@mastra/core/tools'
import { htmlToMarkdown } from 'mdream'
import { withMinimalPreset } from 'mdream/preset/minimal'
import { z } from 'zod'

const maxMarkdownLength = 16_000
const defaultRequestHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

const searchToolInputSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  engine: z.enum(['google', 'bing']).default('google')
})

const searchToolOutputSchema = z.object({
  engine: z.enum(['google', 'bing']),
  query: z.string(),
  url: z.string().url(),
  markdown: z.string(),
  truncated: z.boolean()
})

export type BrowserSearchInput = z.infer<typeof searchToolInputSchema>

export function buildSearchUrl(input: BrowserSearchInput): string {
  const query = input.query.trim()
  const encodedQuery = encodeURIComponent(query)

  if (input.engine === 'bing') {
    return `https://www.bing.com/search?q=${encodedQuery}`
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

export const browserSearchTool = createTool({
  id: 'browser-search',
  description:
    'Search the web with Google or Bing and return markdown converted from the search result HTML. Use this for current web information.',
  inputSchema: searchToolInputSchema,
  outputSchema: searchToolOutputSchema,
  execute: async (input) => {
    const parsedInput = searchToolInputSchema.parse(input)
    const url = buildSearchUrl(parsedInput)

    const response = await fetch(url, {
      method: 'GET',
      headers: defaultRequestHeaders
    })

    if (!response.ok) {
      throw new Error(`Search request failed with status ${response.status}`)
    }

    const html = await response.text()
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
      engine: parsedInput.engine,
      query: parsedInput.query,
      url,
      markdown: clamped.markdown,
      truncated: clamped.truncated
    }
  }
})
