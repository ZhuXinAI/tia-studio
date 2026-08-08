import {
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  BrowserBounds,
  BrowserPanelOpenRequest,
  BrowserTab,
  BrowserTabsState
} from '../../shared/browser'
import { browserIpcChannels, normalizeBrowserUrl } from '../../shared/browser'
import type { BrowserControlService } from './browser-control-service'

const BROWSER_PARTITION = 'persist:tia-browser'
const DEFAULT_BROWSER_URL = 'about:blank'
const DEFAULT_TAB_TITLE = 'New tab'

type BrowserTabRecord = BrowserTab & {
  view: WebContentsView
}

function titleForUrl(url: string): string {
  if (url === DEFAULT_BROWSER_URL) return DEFAULT_TAB_TITLE

  try {
    return new URL(url).hostname || DEFAULT_TAB_TITLE
  } catch {
    return DEFAULT_TAB_TITLE
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Browser navigation failed'
}

function normalizeBounds(value: unknown): BrowserBounds | null {
  if (value === null) return null
  if (typeof value !== 'object' || value === null) return null

  const candidate = value as Partial<BrowserBounds>
  if (
    typeof candidate.x !== 'number' ||
    typeof candidate.y !== 'number' ||
    typeof candidate.width !== 'number' ||
    typeof candidate.height !== 'number' ||
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y) ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height) ||
    candidate.x < 0 ||
    candidate.y < 0 ||
    candidate.width <= 0 ||
    candidate.height <= 0
  ) {
    return null
  }

  return {
    x: Math.round(candidate.x),
    y: Math.round(candidate.y),
    width: Math.round(candidate.width),
    height: Math.round(candidate.height)
  }
}

function sameBounds(left: BrowserBounds | null, right: BrowserBounds | null): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

export class BrowserTabManager {
  private readonly tabs = new Map<string, BrowserTabRecord>()
  private readonly browserSession = session.fromPartition(BROWSER_PARTITION)
  private readonly boundSetViewBounds: (event: IpcMainEvent, value: unknown) => void
  private activeTabId: string | null = null
  private attachedView: WebContentsView | null = null
  private viewBounds: BrowserBounds | null = null
  private disposed = false

  constructor(
    private readonly browserWindow: BrowserWindow,
    private readonly browserControl?: BrowserControlService
  ) {
    // Browser tabs are intentionally isolated from the app renderer and do not receive
    // any preload bridge. Permission prompts are denied until the browser has an
    // explicit, user-facing permission flow.
    this.browserSession.setPermissionCheckHandler(() => false)
    this.browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })

    ipcMain.handle(browserIpcChannels.getState, (event) => {
      this.assertSender(event)
      return this.getState()
    })
    ipcMain.handle(browserIpcChannels.createTab, (event, url?: unknown) => {
      this.assertSender(event)
      return this.createTab(url)
    })
    ipcMain.handle(browserIpcChannels.closeTab, (event, tabId: unknown) => {
      this.assertSender(event)
      this.closeTab(this.readTabId(tabId))
    })
    ipcMain.handle(browserIpcChannels.activateTab, (event, tabId: unknown) => {
      this.assertSender(event)
      this.activateTab(this.readTabId(tabId))
    })
    ipcMain.handle(browserIpcChannels.navigate, (event, tabId: unknown, url: unknown) => {
      this.assertSender(event)
      this.navigate(this.readTabId(tabId), this.readUrl(url))
    })
    ipcMain.handle(browserIpcChannels.reload, (event, tabId: unknown) => {
      this.assertSender(event)
      this.reload(this.readTabId(tabId))
    })
    ipcMain.handle(browserIpcChannels.goBack, (event, tabId: unknown) => {
      this.assertSender(event)
      this.goBack(this.readTabId(tabId))
    })
    ipcMain.handle(browserIpcChannels.goForward, (event, tabId: unknown) => {
      this.assertSender(event)
      this.goForward(this.readTabId(tabId))
    })
    ipcMain.handle(browserIpcChannels.stop, (event, tabId: unknown) => {
      this.assertSender(event)
      this.stop(this.readTabId(tabId))
    })

    this.boundSetViewBounds = (event, value) => {
      if (event.sender !== this.browserWindow.webContents || this.disposed) return
      this.setViewBounds(normalizeBounds(value))
    }
    ipcMain.on(browserIpcChannels.setViewBounds, this.boundSetViewBounds)
  }

  getState(): BrowserTabsState {
    return {
      tabs: [...this.tabs.values()].map((tab) => this.toTab(tab)),
      activeTabId: this.activeTabId
    }
  }

  createTab(rawUrl?: unknown): BrowserTab {
    this.ensureUsable()
    const url = rawUrl === undefined ? DEFAULT_BROWSER_URL : this.readUrl(rawUrl)
    const view = new WebContentsView({
      webPreferences: {
        partition: BROWSER_PARTITION,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: true,
        autoplayPolicy: 'document-user-activation-required'
      }
    })
    const tab: BrowserTabRecord = {
      id: randomUUID(),
      title: titleForUrl(url),
      url,
      loading: url !== DEFAULT_BROWSER_URL,
      canGoBack: false,
      canGoForward: false,
      view
    }

    this.tabs.set(tab.id, tab)
    this.installWebContentsHandlers(tab)
    this.browserControl?.registerTab(tab.id, view.webContents)
    this.activeTabId = tab.id
    this.attachActiveView()
    this.emitState()

    if (url !== DEFAULT_BROWSER_URL) {
      void view.webContents.loadURL(url).catch((error: unknown) => {
        if (!this.tabs.has(tab.id)) return
        tab.loading = false
        tab.error = errorMessage(error)
        this.emitState()
      })
    }

    return this.toTab(tab)
  }

  closeTab(tabId: string): void {
    this.ensureUsable()
    const tab = this.requireTab(tabId)
    const ids = [...this.tabs.keys()]
    const closingIndex = ids.indexOf(tabId)

    if (this.attachedView === tab.view) {
      this.browserWindow.contentView.removeChildView(tab.view)
      this.attachedView = null
    }

    this.tabs.delete(tabId)
    this.browserControl?.unregisterTab(tabId)
    if (this.activeTabId === tabId) {
      this.activeTabId = ids[closingIndex + 1] ?? ids[closingIndex - 1] ?? null
    }

    tab.view.webContents.close({ waitForBeforeUnload: false })
    this.attachActiveView()
    this.emitState()
  }

  activateTab(tabId: string): void {
    this.ensureUsable()
    this.requireTab(tabId)
    if (this.activeTabId === tabId) {
      this.attachActiveView()
      return
    }

    this.activeTabId = tabId
    this.attachActiveView()
    this.emitState()
  }

  navigate(tabId: string, url: string): void {
    this.ensureUsable()
    const tab = this.requireTab(tabId)
    tab.url = url
    tab.title = titleForUrl(url)
    tab.loading = url !== DEFAULT_BROWSER_URL
    tab.error = undefined
    this.emitState()
    if (url === DEFAULT_BROWSER_URL) {
      void tab.view.webContents.loadURL(DEFAULT_BROWSER_URL)
      return
    }

    void tab.view.webContents.loadURL(url).catch((error: unknown) => {
      if (!this.tabs.has(tab.id)) return
      tab.loading = false
      tab.error = errorMessage(error)
      this.emitState()
    })
  }

  reload(tabId: string): void {
    const tab = this.requireTab(tabId)
    tab.error = undefined
    tab.loading = true
    tab.view.webContents.reload()
    this.emitState()
  }

  goBack(tabId: string): void {
    const tab = this.requireTab(tabId)
    if (tab.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack()
    }
  }

  goForward(tabId: string): void {
    const tab = this.requireTab(tabId)
    if (tab.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward()
    }
  }

  stop(tabId: string): void {
    const tab = this.requireTab(tabId)
    tab.view.webContents.stop()
    tab.loading = false
    this.emitState()
  }

  requestPanelOpen(sessionId?: string): void {
    if (this.disposed || this.browserWindow.isDestroyed()) return
    const request: BrowserPanelOpenRequest = sessionId?.trim() ? { sessionId } : {}
    this.browserWindow.webContents.send(browserIpcChannels.requestOpen, request)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    ipcMain.removeHandler(browserIpcChannels.getState)
    ipcMain.removeHandler(browserIpcChannels.createTab)
    ipcMain.removeHandler(browserIpcChannels.closeTab)
    ipcMain.removeHandler(browserIpcChannels.activateTab)
    ipcMain.removeHandler(browserIpcChannels.navigate)
    ipcMain.removeHandler(browserIpcChannels.reload)
    ipcMain.removeHandler(browserIpcChannels.goBack)
    ipcMain.removeHandler(browserIpcChannels.goForward)
    ipcMain.removeHandler(browserIpcChannels.stop)
    ipcMain.removeListener(browserIpcChannels.setViewBounds, this.boundSetViewBounds)

    if (this.attachedView && !this.browserWindow.isDestroyed()) {
      this.browserWindow.contentView.removeChildView(this.attachedView)
    }
    this.attachedView = null
    this.viewBounds = null

    for (const tab of this.tabs.values()) {
      this.browserControl?.unregisterTab(tab.id)
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.close({ waitForBeforeUnload: false })
      }
    }
    this.tabs.clear()
    this.activeTabId = null
  }

  private installWebContentsHandlers(tab: BrowserTabRecord): void {
    const contents = tab.view.webContents
    contents.setWindowOpenHandler(({ url }) => {
      const normalizedUrl = normalizeBrowserUrl(url)
      if (!normalizedUrl) return { action: 'deny' }
      this.createTab(normalizedUrl)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event) => {
      if (!normalizeBrowserUrl(event.url)) event.preventDefault()
    })
    contents.on('will-frame-navigate', (details) => {
      if (details.isMainFrame && !normalizeBrowserUrl(details.url)) {
        details.preventDefault()
      }
    })
    contents.on('did-start-loading', () => {
      if (!this.tabs.has(tab.id)) return
      tab.loading = true
      tab.error = undefined
      this.emitState()
    })
    contents.on('did-stop-loading', () => {
      if (!this.tabs.has(tab.id)) return
      tab.loading = false
      this.updateNavigationState(tab)
    })
    contents.on('did-navigate', (_event, url) => {
      if (!this.tabs.has(tab.id)) return
      this.updateTabUrl(tab, url)
    })
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame || !this.tabs.has(tab.id)) return
      this.updateTabUrl(tab, url)
    })
    contents.on('page-title-updated', (_event, title) => {
      if (!this.tabs.has(tab.id)) return
      tab.title = title.trim() || titleForUrl(tab.url)
      this.emitState()
    })
    contents.on('did-fail-load', (_event, errorCode, description, validatedUrl, isMainFrame) => {
      if (!isMainFrame || !this.tabs.has(tab.id) || errorCode === -3) return
      tab.loading = false
      tab.url = validatedUrl || tab.url
      tab.error = `${description} (${errorCode})`
      this.updateNavigationState(tab)
    })
    contents.on('render-process-gone', (_event, details) => {
      if (!this.tabs.has(tab.id)) return
      tab.loading = false
      tab.error = `Browser renderer stopped: ${details.reason}`
      this.emitState()
    })
    contents.on('destroyed', () => {
      if (!this.tabs.has(tab.id) || this.disposed) return
      this.browserControl?.unregisterTab(tab.id)
      this.tabs.delete(tab.id)
      if (this.activeTabId === tab.id) {
        this.activeTabId = this.tabs.keys().next().value ?? null
        this.attachActiveView()
      }
      this.emitState()
    })
  }

  private updateTabUrl(tab: BrowserTabRecord, url: string): void {
    tab.url = normalizeBrowserUrl(url) ?? tab.url
    tab.title = tab.title === DEFAULT_TAB_TITLE ? titleForUrl(tab.url) : tab.title
    tab.error = undefined
    this.updateNavigationState(tab)
  }

  private updateNavigationState(tab: BrowserTabRecord): void {
    if (tab.view.webContents.isDestroyed()) return
    tab.canGoBack = tab.view.webContents.navigationHistory.canGoBack()
    tab.canGoForward = tab.view.webContents.navigationHistory.canGoForward()
    this.emitState()
  }

  private setViewBounds(bounds: BrowserBounds | null): void {
    if (sameBounds(this.viewBounds, bounds)) return
    this.viewBounds = bounds
    this.attachActiveView()
  }

  private attachActiveView(): void {
    if (this.browserWindow.isDestroyed()) return
    if (this.attachedView) {
      this.browserWindow.contentView.removeChildView(this.attachedView)
      this.attachedView = null
    }

    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined
    if (!tab || !this.viewBounds) return

    this.browserWindow.contentView.addChildView(tab.view)
    tab.view.setBounds(this.viewBounds)
    tab.view.setVisible(true)
    this.attachedView = tab.view
  }

  private toTab(tab: BrowserTabRecord): BrowserTab {
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      loading: tab.loading,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      ...(tab.error ? { error: tab.error } : {})
    }
  }

  private emitState(): void {
    if (this.disposed || this.browserWindow.isDestroyed()) return
    this.browserWindow.webContents.send(browserIpcChannels.state, this.getState())
  }

  private requireTab(tabId: string): BrowserTabRecord {
    const tab = this.tabs.get(tabId)
    if (!tab) throw new Error('Browser tab not found')
    return tab
  }

  private readTabId(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Browser tab id is required')
    return value
  }

  private readUrl(value: unknown): string {
    if (typeof value !== 'string') throw new Error('Browser URL is required')
    const normalizedUrl = normalizeBrowserUrl(value)
    if (!normalizedUrl) throw new Error('Only http://, https://, and about:blank URLs are allowed')
    return normalizedUrl
  }

  private assertSender(event: IpcMainInvokeEvent): void {
    if (event.sender !== this.browserWindow.webContents || this.disposed) {
      throw new Error('Invalid browser IPC sender')
    }
  }

  private ensureUsable(): void {
    if (this.disposed || this.browserWindow.isDestroyed()) {
      throw new Error('Browser is unavailable')
    }
  }
}
