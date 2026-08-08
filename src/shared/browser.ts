export const browserIpcChannels = {
  getState: 'tia-browser:get-state',
  createTab: 'tia-browser:create-tab',
  closeTab: 'tia-browser:close-tab',
  activateTab: 'tia-browser:activate-tab',
  navigate: 'tia-browser:navigate',
  reload: 'tia-browser:reload',
  goBack: 'tia-browser:go-back',
  goForward: 'tia-browser:go-forward',
  stop: 'tia-browser:stop',
  setViewBounds: 'tia-browser:set-view-bounds',
  state: 'tia-browser:state'
} as const

export type BrowserBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type BrowserTab = {
  id: string
  title: string
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error?: string
}

export type BrowserTabsState = {
  tabs: BrowserTab[]
  activeTabId: string | null
}

export type BrowserBridge = {
  getState: () => Promise<BrowserTabsState>
  createTab: (url?: string) => Promise<BrowserTab>
  closeTab: (tabId: string) => Promise<void>
  activateTab: (tabId: string) => Promise<void>
  navigate: (tabId: string, url: string) => Promise<void>
  reload: (tabId: string) => Promise<void>
  goBack: (tabId: string) => Promise<void>
  goForward: (tabId: string) => Promise<void>
  stop: (tabId: string) => Promise<void>
  setViewBounds: (bounds: BrowserBounds | null) => void
  onState: (listener: (state: BrowserTabsState) => void) => () => void
}

export type TiaStudioApi = {
  browser: BrowserBridge
}

export function normalizeBrowserUrl(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === 'about:blank') return trimmed
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
