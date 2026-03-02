export const webSearchEngines = ['google', 'bing', 'baidu'] as const

export type WebSearchEngine = (typeof webSearchEngines)[number]

export const defaultWebSearchEngine: WebSearchEngine = 'bing'

export function isWebSearchEngine(value: unknown): value is WebSearchEngine {
  return typeof value === 'string' && (webSearchEngines as readonly string[]).includes(value)
}
