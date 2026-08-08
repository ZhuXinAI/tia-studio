export const browserCdpIpcChannels = {
  command: 'tia-browser:cdp-command',
  event: 'tia-browser:cdp-event',
  detached: 'tia-browser:cdp-detached'
} as const

// Keep this list intentionally small. It is the product boundary for the first
// browser-control slice; adding a CDP domain should be an explicit security and
// UX decision rather than an accidental pass-through to webContents.debugger.
export const browserCdpMethods = [
  'Page.enable',
  'Page.disable',
  'Page.navigate',
  'Page.reload',
  'Page.stopLoading',
  'Page.getNavigationHistory',
  'Page.captureScreenshot',
  'Runtime.enable',
  'Runtime.disable',
  'Runtime.evaluate',
  'Runtime.callFunctionOn',
  'Runtime.getProperties',
  'Runtime.releaseObject',
  'Runtime.releaseObjectGroup',
  'DOM.enable',
  'DOM.disable',
  'DOM.getDocument',
  'DOM.requestChildNodes',
  'DOM.querySelector',
  'DOM.querySelectorAll',
  'DOM.getOuterHTML',
  'DOM.getAttributes',
  'DOM.describeNode',
  'DOM.getBoxModel',
  'DOM.focus',
  'Input.dispatchMouseEvent',
  'Input.dispatchKeyEvent',
  'Input.insertText',
  'Input.setIgnoreInputEvents',
  'Network.enable',
  'Network.disable',
  'Network.setCacheDisabled',
  'Network.setBypassServiceWorker'
] as const

export type BrowserCdpMethod = (typeof browserCdpMethods)[number]
export type BrowserCdpParams = Readonly<Record<string, unknown>>
export type BrowserCdpPayload = unknown

// Do not forward request/response headers or bodies by default. Those events can
// contain cookies, authorization headers, and other page credentials.
export const browserCdpEventMethods = [
  'Page.domContentEventFired',
  'Page.frameAttached',
  'Page.frameDetached',
  'Page.frameNavigated',
  'Page.frameStartedLoading',
  'Page.frameStoppedLoading',
  'Page.lifecycleEvent',
  'Page.loadEventFired',
  'Page.navigatedWithinDocument',
  'Page.windowOpen',
  'Runtime.consoleAPICalled',
  'Runtime.exceptionRevoked',
  'Runtime.exceptionThrown',
  'Runtime.executionContextCleared',
  'Runtime.executionContextCreated',
  'Runtime.executionContextDestroyed',
  'DOM.attributeModified',
  'DOM.attributeRemoved',
  'DOM.characterDataModified',
  'DOM.childNodeCountUpdated',
  'DOM.childNodeInserted',
  'DOM.childNodeRemoved',
  'DOM.documentUpdated',
  'DOM.setChildNodes',
  'Network.dataReceived',
  'Network.loadingFailed',
  'Network.loadingFinished'
] as const

export type BrowserCdpEventMethod = (typeof browserCdpEventMethods)[number]

export type BrowserCdpEvent = {
  tabId: string
  method: BrowserCdpEventMethod
  params: BrowserCdpPayload
  sessionId?: string
}

export type BrowserCdpDetachEvent = {
  tabId: string
  reason: string
}

export type BrowserCdpBridge = {
  sendCommand: (
    tabId: string,
    method: BrowserCdpMethod,
    params?: BrowserCdpParams
  ) => Promise<BrowserCdpPayload>
  onEvent: (listener: (event: BrowserCdpEvent) => void) => () => void
  onDetach: (listener: (event: BrowserCdpDetachEvent) => void) => () => void
}

export function isBrowserCdpMethod(value: unknown): value is BrowserCdpMethod {
  return typeof value === 'string' && (browserCdpMethods as readonly string[]).includes(value)
}

export function isBrowserCdpEventMethod(value: unknown): value is BrowserCdpEventMethod {
  return typeof value === 'string' && (browserCdpEventMethods as readonly string[]).includes(value)
}
