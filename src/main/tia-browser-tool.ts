import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import {
  TIA_BROWSER_TOOL_HANDOFF_DONE_MARKER as BUILT_IN_BROWSER_HANDOFF_DONE_MARKER,
  type TiaBrowserToolAutomationCommand as BuiltInBrowserAutomationCommand,
  type TiaBrowserToolAutomationResult as BuiltInBrowserAutomationResult,
  type TiaBrowserToolBox as BuiltInBrowserBox,
  type TiaBrowserToolWaitLoadState as BuiltInBrowserWaitLoadState
} from './tia-browser-tool-contract'
import { tiaBrowserToolLog, tiaBrowserToolTrace } from './tia-browser-tool-logger'
import {
  takeTiaBrowserToolSnapshot as takeBuiltInBrowserSnapshot,
  type SnapshotRef
} from './tia-browser-tool-snapshot'

export type TiaBrowserToolHumanHandoffRequest = {
  message: string
  buttonLabel?: string
  timeoutMs?: number
}

export type TiaBrowserToolHumanHandoffResult = {
  status: 'completed' | 'timed_out'
  currentUrl: string | null
}

export type TiaBrowserToolRuntimeOptions = {
  partition?: string
  show?: boolean
}

type ActiveHandoff = {
  requestId: string
  message: string
  buttonLabel: string
}

type ModifierKey = 'shift' | 'control' | 'alt' | 'meta'

type AutomationState = {
  refMap: Map<string, SnapshotRef>
  heldModifiers: Set<ModifierKey>
  network: {
    inFlightRequests: number
    lastActivityAt: number
  }
  debuggerListenerAttached: boolean
}

type ParsedKeyInput = {
  keyCode: string
  text: string | null
  modifiers: ModifierKey[]
}

const WAIT_POLL_INTERVAL_MS = 100
const WAIT_DEFAULT_TIMEOUT_MS = 15_000
const NETWORK_IDLE_DELAY_MS = 500
const DEFAULT_PARTITION = 'persist:tia-browser-tool'
const TIA_BROWSER_TOOL_RUNTIME_SCOPE = 'TiaBrowserToolRuntime'

let browserWindow: BrowserWindow | null = null
let activeHandoff: ActiveHandoff | null = null
let automationState: AutomationState | null = null
let runtimeOptions: TiaBrowserToolRuntimeOptions = {}
let pendingHandoff: {
  requestId: string
  resolve: (value: TiaBrowserToolHumanHandoffResult) => void
  reject: (reason?: unknown) => void
  timeoutHandle: NodeJS.Timeout
} | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function summarizeAutomationCommand(
  input: BuiltInBrowserAutomationCommand
): Record<string, unknown> {
  return {
    action: input.action,
    ref: 'ref' in input ? (input.ref ?? null) : undefined,
    url: input.action === 'open' ? input.url : undefined,
    loadState: input.action === 'wait' ? (input.loadState ?? null) : undefined,
    timeoutMs: input.action === 'wait' ? (input.timeoutMs ?? null) : undefined,
    milliseconds: input.action === 'wait' ? (input.milliseconds ?? null) : undefined,
    textLength: 'text' in input && typeof input.text === 'string' ? input.text.length : undefined,
    selector: 'selector' in input ? (input.selector ?? null) : undefined,
    valuesCount: 'values' in input && Array.isArray(input.values) ? input.values.length : undefined,
    filePathsCount:
      'filePaths' in input && Array.isArray(input.filePaths) ? input.filePaths.length : undefined
  }
}

function summarizeAutomationResult(
  result: BuiltInBrowserAutomationResult
): Record<string, unknown> {
  return {
    action: result.action,
    currentUrl: result.currentUrl ?? null,
    title: result.title ?? null,
    waitedFor: result.waitedFor ?? null,
    hasSnapshot: typeof result.snapshot === 'string',
    snapshotLength: result.snapshot?.length ?? 0,
    hasText: typeof result.text === 'string',
    textLength: result.text?.length ?? 0,
    value: result.value ?? null,
    count: result.count ?? null,
    message: result.message ?? null
  }
}

function logWindowEvent(event: string, data?: unknown): void {
  tiaBrowserToolTrace(TIA_BROWSER_TOOL_RUNTIME_SCOPE, `window event: ${event}`, data)
}

function readWindowUrl(window: BrowserWindow | null): string | null {
  if (!window) {
    return null
  }

  try {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      return null
    }

    return window.webContents.getURL() || null
  } catch {
    return null
  }
}

function readWindowTitle(window: BrowserWindow | null): string | null {
  if (!window) {
    return null
  }

  try {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      return null
    }

    return window.webContents.getTitle() || null
  } catch {
    return null
  }
}

function getCurrentUrl(): string {
  return readWindowUrl(browserWindow) ?? 'about:blank'
}

function getCurrentWindow(): BrowserWindow {
  const currentWindow = browserWindow
  if (!currentWindow || currentWindow.isDestroyed()) {
    throw new Error('TIA browser tool window is not ready.')
  }

  return currentWindow
}

function getAutomationState(): AutomationState {
  if (!automationState) {
    automationState = {
      refMap: new Map<string, SnapshotRef>(),
      heldModifiers: new Set<ModifierKey>(),
      network: {
        inFlightRequests: 0,
        lastActivityAt: Date.now()
      },
      debuggerListenerAttached: false
    }
  }

  return automationState
}

function resetAutomationState(): void {
  automationState = {
    refMap: new Map<string, SnapshotRef>(),
    heldModifiers: new Set<ModifierKey>(),
    network: {
      inFlightRequests: 0,
      lastActivityAt: Date.now()
    },
    debuggerListenerAttached: false
  }
}

function clearInteractionState(): void {
  const state = getAutomationState()
  state.refMap.clear()
  state.heldModifiers.clear()
}

async function injectHandoffOverlay(handoff: ActiveHandoff): Promise<void> {
  const currentWindow = getCurrentWindow()
  const serializedHandoff = JSON.stringify(handoff)
  await currentWindow.webContents.executeJavaScript(
    `
      (() => {
        const handoff = ${serializedHandoff}
        const overlayId = '__tia_built_in_browser_handoff__'
        const existing = document.getElementById(overlayId)
        if (existing) {
          existing.remove()
        }

        const overlay = document.createElement('div')
        overlay.id = overlayId
        overlay.style.cssText = [
          'position: fixed',
          'right: 24px',
          'bottom: 24px',
          'z-index: 2147483647',
          'max-width: min(420px, calc(100vw - 48px))',
          'padding: 16px',
          'border-radius: 16px',
          'background: rgba(17, 24, 39, 0.96)',
          'color: white',
          'box-shadow: 0 18px 50px rgba(15, 23, 42, 0.35)',
          'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          'line-height: 1.45'
        ].join(';')

        const title = document.createElement('div')
        title.textContent = 'Human step needed'
        title.style.cssText = 'font-size: 14px; font-weight: 700; margin-bottom: 8px;'
        overlay.appendChild(title)

        const message = document.createElement('div')
        message.textContent = handoff.message
        message.style.cssText = 'font-size: 13px; margin-bottom: 12px;'
        overlay.appendChild(message)

        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = handoff.buttonLabel
        button.style.cssText = [
          'appearance: none',
          'border: 0',
          'border-radius: 999px',
          'padding: 10px 14px',
          'font-size: 13px',
          'font-weight: 600',
          'cursor: pointer',
          'background: #f8fafc',
          'color: #0f172a'
        ].join(';')
        button.addEventListener('click', () => {
          console.log('${BUILT_IN_BROWSER_HANDOFF_DONE_MARKER}:' + handoff.requestId)
          overlay.remove()
        })
        overlay.appendChild(button)

        document.documentElement.appendChild(overlay)
      })();
    `,
    true
  )
}

async function clearHandoffOverlay(): Promise<void> {
  const currentWindow = browserWindow
  if (!currentWindow || currentWindow.isDestroyed()) {
    return
  }

  await currentWindow.webContents.executeJavaScript(
    `
      (() => {
        document.getElementById('__tia_built_in_browser_handoff__')?.remove()
      })();
    `,
    true
  )
}

function normalizeOpenUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (trimmed.length === 0) {
    throw new Error('Open URL must not be empty.')
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

function normalizeRef(ref: string): string {
  const trimmed = ref.trim()
  if (trimmed.length === 0) {
    throw new Error('Element ref must not be empty.')
  }

  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
}

function getRefEntry(ref: string): SnapshotRef {
  const entry = getAutomationState().refMap.get(normalizeRef(ref))
  if (!entry || typeof entry.backendNodeId !== 'number') {
    throw new Error(`Unknown or stale element ref "${ref}". Run snapshot again to refresh refs.`)
  }

  return entry
}

function normalizeModifierName(value: string): ModifierKey | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'shift') {
    return 'shift'
  }
  if (normalized === 'control' || normalized === 'ctrl') {
    return 'control'
  }
  if (normalized === 'alt' || normalized === 'option') {
    return 'alt'
  }
  if (normalized === 'meta' || normalized === 'command' || normalized === 'cmd') {
    return 'meta'
  }

  return null
}

function normalizeKeyCode(value: string): { keyCode: string; text: string | null } {
  const trimmed = value.trim()
  if (trimmed.length === 1) {
    return {
      keyCode: trimmed.toUpperCase(),
      text: trimmed
    }
  }

  const map: Record<string, string> = {
    enter: 'Enter',
    tab: 'Tab',
    escape: 'Escape',
    esc: 'Escape',
    space: 'Space',
    spacebar: 'Space',
    backspace: 'Backspace',
    delete: 'Delete',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    shift: 'Shift',
    control: 'Control',
    ctrl: 'Control',
    alt: 'Alt',
    meta: 'Meta',
    command: 'Meta',
    cmd: 'Meta'
  }

  const keyCode = map[trimmed.toLowerCase()]
  return {
    keyCode: keyCode ?? trimmed,
    text: keyCode === 'Space' ? ' ' : null
  }
}

function parseKeyInput(value: string): ParsedKeyInput {
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length === 0) {
    throw new Error('Key input must not be empty.')
  }

  const lastPart = parts.pop() ?? ''
  const modifiers = parts
    .map((part) => normalizeModifierName(part))
    .filter((part): part is ModifierKey => part !== null)

  const normalizedKey = normalizeKeyCode(lastPart)
  return {
    keyCode: normalizedKey.keyCode,
    text: normalizedKey.text,
    modifiers
  }
}

function isModifierKeyCode(keyCode: string): keyCode is 'Shift' | 'Control' | 'Alt' | 'Meta' {
  return keyCode === 'Shift' || keyCode === 'Control' || keyCode === 'Alt' || keyCode === 'Meta'
}

function toModifierNameFromKeyCode(keyCode: 'Shift' | 'Control' | 'Alt' | 'Meta'): ModifierKey {
  switch (keyCode) {
    case 'Shift':
      return 'shift'
    case 'Control':
      return 'control'
    case 'Alt':
      return 'alt'
    case 'Meta':
      return 'meta'
  }
}

function getActiveModifiers(extra: ModifierKey[] = []): ModifierKey[] {
  const modifiers = new Set<ModifierKey>(getAutomationState().heldModifiers)
  for (const modifier of extra) {
    modifiers.add(modifier)
  }

  return [...modifiers]
}

async function ensureDebuggerAttached(window: BrowserWindow): Promise<void> {
  const state = getAutomationState()
  if (!window.webContents.debugger.isAttached()) {
    tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'attaching webContents debugger')
    window.webContents.debugger.attach('1.3')
  }

  if (!state.debuggerListenerAttached) {
    window.webContents.debugger.on('message', (_event, method) => {
      if (method === 'Network.requestWillBeSent') {
        state.network.inFlightRequests += 1
        state.network.lastActivityAt = Date.now()
        return
      }

      if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
        state.network.inFlightRequests = Math.max(0, state.network.inFlightRequests - 1)
        state.network.lastActivityAt = Date.now()
      }
    })
    state.debuggerListenerAttached = true
    tiaBrowserToolTrace(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'attached debugger network listeners')
  }

  await window.webContents.debugger.sendCommand('Network.enable')
  tiaBrowserToolTrace(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'enabled debugger network domain')
}

async function sendDebuggerCommand<T = unknown>(
  window: BrowserWindow,
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  await ensureDebuggerAttached(window)
  return (await window.webContents.debugger.sendCommand(method, params)) as T
}

async function resolveObjectId(window: BrowserWindow, ref: string): Promise<string> {
  const entry = getRefEntry(ref)
  const result = await sendDebuggerCommand<{
    object?: {
      objectId?: string
    }
  }>(window, 'DOM.resolveNode', {
    backendNodeId: entry.backendNodeId
  })

  const objectId = result.object?.objectId
  if (!objectId) {
    throw new Error(`Could not resolve element ref "${ref}". Run snapshot again to refresh refs.`)
  }

  return objectId
}

async function callFunctionOn<T = unknown>(input: {
  window: BrowserWindow
  objectId: string
  functionDeclaration: string
  args?: unknown[]
  returnByValue?: boolean
}): Promise<T> {
  const result = await sendDebuggerCommand<{
    result?: {
      value?: T
    }
    exceptionDetails?: unknown
  }>(input.window, 'Runtime.callFunctionOn', {
    objectId: input.objectId,
    functionDeclaration: input.functionDeclaration,
    arguments: (input.args ?? []).map((value) => ({ value })),
    returnByValue: input.returnByValue ?? true,
    awaitPromise: true
  })

  if (result.exceptionDetails) {
    throw new Error('Browser function execution failed.')
  }

  return result.result?.value as T
}

async function evaluateInWindow<T = unknown>(
  window: BrowserWindow,
  expression: string
): Promise<T> {
  const result = await sendDebuggerCommand<{
    result?: {
      value?: T
    }
    exceptionDetails?: unknown
  }>(window, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })

  if (result.exceptionDetails) {
    throw new Error('Browser evaluation failed.')
  }

  return result.result?.value as T
}

async function getElementBox(window: BrowserWindow, ref: string): Promise<BuiltInBrowserBox> {
  const objectId = await resolveObjectId(window, ref)
  const box = await callFunctionOn<BuiltInBrowserBox | null>({
    window,
    objectId,
    functionDeclaration: `
      function() {
        const rect = this.getBoundingClientRect()
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      }
    `
  })

  if (!box) {
    throw new Error(`Could not compute the box for "${ref}".`)
  }

  return box
}

function toMousePoint(box: BuiltInBrowserBox): { x: number; y: number } {
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2)
  }
}

function sendMouseClick(window: BrowserWindow, box: BuiltInBrowserBox, clickCount: number): void {
  const point = toMousePoint(box)
  const modifiers = getActiveModifiers()
  window.webContents.sendInputEvent({
    type: 'mouseMove',
    x: point.x,
    y: point.y,
    modifiers
  })
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount,
    modifiers
  })
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount,
    modifiers
  })
}

async function createBrowserWindow(): Promise<BrowserWindow> {
  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'creating browser window', {
    partition: runtimeOptions.partition ?? DEFAULT_PARTITION,
    show: runtimeOptions.show ?? false
  })
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    show: runtimeOptions.show ?? false,
    autoHideMenuBar: true,
    title: 'TIA Browser Tool',
    webPreferences: {
      backgroundThrottling: false,
      nodeIntegration: false,
      contextIsolation: true,
      partition: runtimeOptions.partition ?? DEFAULT_PARTITION
    }
  })
  window.on('closed', () => {
    logWindowEvent('closed', {
      currentUrl: browserWindow === window ? getCurrentUrl() : readWindowUrl(window)
    })
    if (browserWindow === window) {
      browserWindow = null
      resetAutomationState()

      if (pendingHandoff) {
        clearTimeout(pendingHandoff.timeoutHandle)
        pendingHandoff.reject(new Error('TIA browser tool window was closed during handoff.'))
        pendingHandoff = null
      }
    }
  })
  window.on('show', () => {
    logWindowEvent('show', { currentUrl: readWindowUrl(window) })
  })
  window.on('hide', () => {
    logWindowEvent('hide', { currentUrl: readWindowUrl(window) })
  })
  window.on('focus', () => {
    logWindowEvent('focus', { currentUrl: readWindowUrl(window) })
  })
  window.on('unresponsive', () => {
    tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'browser window became unresponsive', {
      currentUrl: readWindowUrl(window)
    })
  })
  window.on('responsive', () => {
    tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'browser window recovered responsiveness', {
      currentUrl: readWindowUrl(window)
    })
  })

  window.webContents.on('console-message', (_event, level, message) => {
    logWindowEvent('console-message', {
      level,
      message
    })
    if (!message.startsWith(`${BUILT_IN_BROWSER_HANDOFF_DONE_MARKER}:`)) {
      return
    }

    const requestId = message.slice(`${BUILT_IN_BROWSER_HANDOFF_DONE_MARKER}:`.length)
    if (!activeHandoff || activeHandoff.requestId !== requestId) {
      return
    }

    activeHandoff = null
    if (!pendingHandoff || pendingHandoff.requestId !== requestId) {
      return
    }

    clearTimeout(pendingHandoff.timeoutHandle)
    tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'human handoff completed', {
      currentUrl: getCurrentUrl(),
      requestId
    })
    pendingHandoff.resolve({
      status: 'completed',
      currentUrl: getCurrentUrl()
    })
    pendingHandoff = null
  })
  window.webContents.on('dom-ready', () => {
    logWindowEvent('dom-ready', { currentUrl: readWindowUrl(window) })
    if (!activeHandoff || browserWindow !== window) {
      return
    }

    void injectHandoffOverlay(activeHandoff).catch((error) => {
      tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'failed to inject handoff overlay', {
        error
      })
      if (!pendingHandoff) {
        return
      }

      clearTimeout(pendingHandoff.timeoutHandle)
      pendingHandoff.reject(
        error instanceof Error ? error : new Error('Unknown handoff injection failure.')
      )
      pendingHandoff = null
    })
  })
  window.webContents.on('did-navigate', () => {
    logWindowEvent('did-navigate', { currentUrl: readWindowUrl(window) })
    if (browserWindow === window) {
      clearInteractionState()
    }
  })
  window.webContents.on('did-navigate-in-page', () => {
    logWindowEvent('did-navigate-in-page', { currentUrl: readWindowUrl(window) })
    if (browserWindow === window) {
      clearInteractionState()
    }
  })
  window.webContents.on('did-start-loading', () => {
    logWindowEvent('did-start-loading', { currentUrl: readWindowUrl(window) })
  })
  window.webContents.on('did-stop-loading', () => {
    logWindowEvent('did-stop-loading', { currentUrl: readWindowUrl(window) })
  })
  window.webContents.on('did-finish-load', () => {
    logWindowEvent('did-finish-load', {
      currentUrl: readWindowUrl(window),
      title: readWindowTitle(window)
    })
  })
  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'page load failed', {
        currentUrl: readWindowUrl(window),
        errorCode,
        errorDescription,
        isMainFrame,
        validatedURL
      })
    }
  )
  window.webContents.on('render-process-gone', (_event, details) => {
    tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'renderer process exited', {
      currentUrl: readWindowUrl(window),
      reason: details.reason,
      exitCode: details.exitCode
    })
  })
  window.webContents.setWindowOpenHandler((details) => {
    tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'intercepted window.open request', {
      url: details.url
    })
    void window.loadURL(details.url)
    return { action: 'deny' }
  })

  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'browser window created')
  return window
}

export function setTiaBrowserToolRuntimeOptions(options: TiaBrowserToolRuntimeOptions): void {
  runtimeOptions = {
    ...runtimeOptions,
    ...options
  }
}

async function setCurrentWindow(window: BrowserWindow): Promise<void> {
  resetAutomationState()
  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'set current browser window', {
    currentUrl: readWindowUrl(window)
  })
  // Electron can hang Network.enable if CDP is attached before the first page load finishes.
  try {
    await ensureDebuggerAttached(window)
  } catch (error) {
    if (!window.isDestroyed()) {
      window.destroy()
    }
    throw error
  }
  browserWindow = window
  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'browser window ready for automation', {
    currentUrl: readWindowUrl(window)
  })
}

async function ensurePlaceholderWindow(): Promise<BrowserWindow> {
  if (browserWindow && !browserWindow.isDestroyed()) {
    tiaBrowserToolTrace(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'reusing existing browser window', {
      currentUrl: readWindowUrl(browserWindow)
    })
    return browserWindow
  }

  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'creating placeholder browser window')
  const placeholderWindow = await createBrowserWindow()
  await placeholderWindow.loadURL('about:blank')
  await setCurrentWindow(placeholderWindow)
  return placeholderWindow
}

async function waitForCondition(input: {
  timeoutMs: number
  evaluate: () => Promise<boolean>
  failureMessage: string
}): Promise<void> {
  tiaBrowserToolTrace(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'waiting for condition', {
    timeoutMs: input.timeoutMs,
    failureMessage: input.failureMessage
  })
  const deadline = Date.now() + input.timeoutMs
  while (Date.now() < deadline) {
    if (await input.evaluate()) {
      tiaBrowserToolTrace(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'wait condition satisfied', {
        failureMessage: input.failureMessage
      })
      return
    }

    await sleep(WAIT_POLL_INTERVAL_MS)
  }

  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'wait condition timed out', {
    timeoutMs: input.timeoutMs,
    failureMessage: input.failureMessage
  })
  throw new Error(input.failureMessage)
}

function createUrlPatternRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replaceAll('\\*', '.*')}$`)
}

async function waitForLoadState(
  window: BrowserWindow,
  loadState: BuiltInBrowserWaitLoadState,
  timeoutMs: number
): Promise<void> {
  tiaBrowserToolTrace(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'waiting for load state', {
    currentUrl: readWindowUrl(window),
    loadState,
    timeoutMs
  })
  if (loadState === 'networkidle') {
    await waitForCondition({
      timeoutMs,
      evaluate: async () => {
        const state = getAutomationState()
        const readyState = await evaluateInWindow<string>(window, 'document.readyState')
        return (
          readyState === 'complete' &&
          state.network.inFlightRequests === 0 &&
          Date.now() - state.network.lastActivityAt >= NETWORK_IDLE_DELAY_MS
        )
      },
      failureMessage: `Timed out waiting for the page to reach ${loadState}.`
    })
    return
  }

  await waitForCondition({
    timeoutMs,
    evaluate: async () => {
      const readyState = await evaluateInWindow<string>(window, 'document.readyState')
      return loadState === 'domcontentloaded'
        ? readyState === 'interactive' || readyState === 'complete'
        : readyState === 'complete'
    },
    failureMessage: `Timed out waiting for the page to reach ${loadState}.`
  })
}

async function executeAutomationCommand(
  input: BuiltInBrowserAutomationCommand
): Promise<BuiltInBrowserAutomationResult> {
  switch (input.action) {
    case 'open': {
      const previousWindow = browserWindow
      const nextWindow = await createBrowserWindow()

      try {
        await nextWindow.loadURL(normalizeOpenUrl(input.url))
      } catch (error) {
        nextWindow.destroy()
        throw error
      }

      await setCurrentWindow(nextWindow)
      if (previousWindow && !previousWindow.isDestroyed() && previousWindow !== nextWindow) {
        previousWindow.destroy()
      }

      return {
        action: 'open',
        currentUrl: getCurrentUrl(),
        title: readWindowTitle(nextWindow) ?? undefined
      }
    }
    case 'close': {
      const currentWindow = await ensurePlaceholderWindow()
      const replacementWindow = await createBrowserWindow()
      await replacementWindow.loadURL('about:blank')
      await setCurrentWindow(replacementWindow)
      if (!currentWindow.isDestroyed() && currentWindow !== replacementWindow) {
        currentWindow.destroy()
      }

      return {
        action: 'close',
        currentUrl: getCurrentUrl(),
        message: 'Closed the current browser page.'
      }
    }
  }

  const window = await ensurePlaceholderWindow()

  switch (input.action) {
    case 'snapshot': {
      const snapshot = await takeBuiltInBrowserSnapshot({
        options: input,
        refMap: getAutomationState().refMap,
        sendCommand: (method, params) => sendDebuggerCommand(window, method, params)
      })

      return {
        action: 'snapshot',
        currentUrl: getCurrentUrl(),
        snapshot
      }
    }
    case 'click': {
      if (input.newTab) {
        const objectId = await resolveObjectId(window, input.ref)
        const href = await callFunctionOn<string | null>({
          window,
          objectId,
          functionDeclaration: `
            function() {
              return this.href || this.getAttribute?.('href') || null
            }
          `
        })

        if (href) {
          return await executeAutomationCommand({
            action: 'open',
            url: href
          })
        }
      }

      const box = await getElementBox(window, input.ref)
      sendMouseClick(window, box, 1)
      return {
        action: 'click',
        currentUrl: getCurrentUrl(),
        box
      }
    }
    case 'dblclick': {
      const box = await getElementBox(window, input.ref)
      sendMouseClick(window, box, 2)
      return {
        action: 'dblclick',
        currentUrl: getCurrentUrl(),
        box
      }
    }
    case 'focus': {
      const objectId = await resolveObjectId(window, input.ref)
      await callFunctionOn({
        window,
        objectId,
        functionDeclaration: 'function() { this.focus(); }'
      })
      return {
        action: 'focus',
        currentUrl: getCurrentUrl()
      }
    }
    case 'fill':
    case 'type': {
      const objectId = await resolveObjectId(window, input.ref)
      const text = input.text
      const shouldClear = input.action === 'fill'
      await callFunctionOn({
        window,
        objectId,
        args: [text, shouldClear],
        functionDeclaration: `
          function(nextText, shouldClear) {
            this.focus()
            const applyText = (element, value) => {
              const current = typeof element.value === 'string' ? element.value : ''
              element.value = shouldClear ? value : current + value
              element.dispatchEvent(new Event('input', { bubbles: true }))
              element.dispatchEvent(new Event('change', { bubbles: true }))
            }

            if (this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement) {
              applyText(this, nextText)
              return this.value
            }

            if (this instanceof HTMLSelectElement) {
              this.value = nextText
              this.dispatchEvent(new Event('input', { bubbles: true }))
              this.dispatchEvent(new Event('change', { bubbles: true }))
              return this.value
            }

            if (this.isContentEditable) {
              const current = this.textContent || ''
              this.textContent = shouldClear ? nextText : current + nextText
              this.dispatchEvent(new Event('input', { bubbles: true }))
              return this.textContent || ''
            }

            throw new Error('Element does not support text entry.')
          }
        `
      })
      return {
        action: input.action,
        currentUrl: getCurrentUrl(),
        value: text
      }
    }
    case 'press':
    case 'keydown':
    case 'keyup': {
      const parsed = parseKeyInput(input.key)
      const modifiers = getActiveModifiers(parsed.modifiers)
      const type =
        input.action === 'press' ? 'keyDown' : input.action === 'keydown' ? 'keyDown' : 'keyUp'

      window.webContents.sendInputEvent({
        type,
        keyCode: parsed.keyCode,
        modifiers
      })

      if (
        input.action === 'press' &&
        parsed.text &&
        !modifiers.includes('control') &&
        !modifiers.includes('alt') &&
        !modifiers.includes('meta')
      ) {
        window.webContents.sendInputEvent({
          type: 'char',
          keyCode: parsed.text
        })
      }

      if (input.action === 'press') {
        window.webContents.sendInputEvent({
          type: 'keyUp',
          keyCode: parsed.keyCode,
          modifiers
        })
      }

      if (isModifierKeyCode(parsed.keyCode)) {
        const modifier = toModifierNameFromKeyCode(parsed.keyCode)
        if (input.action === 'keydown') {
          getAutomationState().heldModifiers.add(modifier)
        }
        if (input.action === 'keyup') {
          getAutomationState().heldModifiers.delete(modifier)
        }
      }

      return {
        action: input.action,
        currentUrl: getCurrentUrl()
      }
    }
    case 'hover': {
      const box = await getElementBox(window, input.ref)
      const point = toMousePoint(box)
      window.webContents.sendInputEvent({
        type: 'mouseMove',
        x: point.x,
        y: point.y,
        modifiers: getActiveModifiers()
      })
      return {
        action: 'hover',
        currentUrl: getCurrentUrl(),
        box
      }
    }
    case 'check':
    case 'uncheck': {
      const objectId = await resolveObjectId(window, input.ref)
      const checked = input.action === 'check'
      await callFunctionOn({
        window,
        objectId,
        args: [checked],
        functionDeclaration: `
          function(nextChecked) {
            if (!(this instanceof HTMLInputElement)) {
              throw new Error('Element is not a checkbox or radio input.')
            }

            this.checked = nextChecked
            this.dispatchEvent(new Event('input', { bubbles: true }))
            this.dispatchEvent(new Event('change', { bubbles: true }))
          }
        `
      })
      return {
        action: input.action,
        currentUrl: getCurrentUrl()
      }
    }
    case 'select': {
      const objectId = await resolveObjectId(window, input.ref)
      const values = input.values
      const selectedValues = await callFunctionOn<string[]>({
        window,
        objectId,
        args: [values],
        functionDeclaration: `
          function(nextValues) {
            if (!(this instanceof HTMLSelectElement)) {
              throw new Error('Element is not a <select>.')
            }

            const selectedValues = new Set(nextValues)
            for (const option of Array.from(this.options)) {
              option.selected = selectedValues.has(option.value)
            }

            this.dispatchEvent(new Event('input', { bubbles: true }))
            this.dispatchEvent(new Event('change', { bubbles: true }))

            return Array.from(this.selectedOptions).map((option) => option.value)
          }
        `
      })

      return {
        action: 'select',
        currentUrl: getCurrentUrl(),
        value: selectedValues.join(', ')
      }
    }
    case 'scroll': {
      const direction = input.direction ?? 'down'
      const amount = Math.abs(input.amount ?? 300)
      const deltaByDirection: Record<string, { x: number; y: number }> = {
        up: { x: 0, y: -amount },
        down: { x: 0, y: amount },
        left: { x: -amount, y: 0 },
        right: { x: amount, y: 0 }
      }
      const delta = deltaByDirection[direction]
      await window.webContents.executeJavaScript(`window.scrollBy(${delta.x}, ${delta.y});`, true)
      return {
        action: 'scroll',
        currentUrl: getCurrentUrl(),
        message: `Scrolled ${direction} by ${amount}px.`
      }
    }
    case 'scrollintoview': {
      const objectId = await resolveObjectId(window, input.ref)
      await callFunctionOn({
        window,
        objectId,
        functionDeclaration: `
          function() {
            this.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
          }
        `
      })
      return {
        action: 'scrollintoview',
        currentUrl: getCurrentUrl()
      }
    }
    case 'drag': {
      const sourceBox = await getElementBox(window, input.sourceRef)
      const targetBox = await getElementBox(window, input.targetRef)
      const sourcePoint = toMousePoint(sourceBox)
      const targetPoint = toMousePoint(targetBox)
      const modifiers = getActiveModifiers()

      window.webContents.sendInputEvent({
        type: 'mouseMove',
        x: sourcePoint.x,
        y: sourcePoint.y,
        modifiers
      })
      window.webContents.sendInputEvent({
        type: 'mouseDown',
        x: sourcePoint.x,
        y: sourcePoint.y,
        button: 'left',
        clickCount: 1,
        modifiers
      })
      window.webContents.sendInputEvent({
        type: 'mouseMove',
        x: targetPoint.x,
        y: targetPoint.y,
        modifiers
      })
      window.webContents.sendInputEvent({
        type: 'mouseUp',
        x: targetPoint.x,
        y: targetPoint.y,
        button: 'left',
        clickCount: 1,
        modifiers
      })

      return {
        action: 'drag',
        currentUrl: getCurrentUrl(),
        box: targetBox
      }
    }
    case 'upload': {
      const entry = getRefEntry(input.ref)
      await sendDebuggerCommand(window, 'DOM.setFileInputFiles', {
        backendNodeId: entry.backendNodeId,
        files: input.filePaths
      })

      return {
        action: 'upload',
        currentUrl: getCurrentUrl(),
        value: input.filePaths.join(', ')
      }
    }
    case 'get': {
      switch (input.kind) {
        case 'title':
          return {
            action: 'get',
            currentUrl: getCurrentUrl(),
            title: readWindowTitle(window) ?? ''
          }
        case 'url':
          return {
            action: 'get',
            currentUrl: getCurrentUrl(),
            value: getCurrentUrl()
          }
        case 'count': {
          if (!input.selector) {
            throw new Error('Get count requires a CSS selector.')
          }
          const count = await evaluateInWindow<number>(
            window,
            `document.querySelectorAll(${JSON.stringify(input.selector)}).length`
          )
          return {
            action: 'get',
            currentUrl: getCurrentUrl(),
            count
          }
        }
      }

      if (!input.ref) {
        throw new Error(`Get ${input.kind} requires an element ref.`)
      }

      const objectId = await resolveObjectId(window, input.ref)
      switch (input.kind) {
        case 'text': {
          const text = await callFunctionOn<string>({
            window,
            objectId,
            functionDeclaration: `
              function() {
                return (this.innerText || this.textContent || '').trim()
              }
            `
          })
          return { action: 'get', currentUrl: getCurrentUrl(), text }
        }
        case 'html': {
          const text = await callFunctionOn<string>({
            window,
            objectId,
            functionDeclaration: 'function() { return this.innerHTML || "" }'
          })
          return { action: 'get', currentUrl: getCurrentUrl(), text }
        }
        case 'value': {
          const value = await callFunctionOn<string>({
            window,
            objectId,
            functionDeclaration: `
              function() {
                return typeof this.value === 'string' ? this.value : ''
              }
            `
          })
          return { action: 'get', currentUrl: getCurrentUrl(), value }
        }
        case 'attr': {
          if (!input.name) {
            throw new Error('Get attr requires an attribute name.')
          }
          const attribute = await callFunctionOn<string | null>({
            window,
            objectId,
            args: [input.name],
            functionDeclaration: `
              function(name) {
                return this.getAttribute ? this.getAttribute(name) : null
              }
            `
          })
          return { action: 'get', currentUrl: getCurrentUrl(), attribute }
        }
        case 'box': {
          const box = await getElementBox(window, input.ref)
          return { action: 'get', currentUrl: getCurrentUrl(), box }
        }
        case 'styles': {
          const styles = await callFunctionOn<Record<string, string>>({
            window,
            objectId,
            functionDeclaration: `
              function() {
                const styles = getComputedStyle(this)
                return {
                  fontFamily: styles.fontFamily,
                  fontSize: styles.fontSize,
                  fontWeight: styles.fontWeight,
                  color: styles.color,
                  backgroundColor: styles.backgroundColor,
                  display: styles.display,
                  visibility: styles.visibility,
                  opacity: styles.opacity
                }
              }
            `
          })
          return { action: 'get', currentUrl: getCurrentUrl(), styles }
        }
      }

      throw new Error(`Unsupported get kind "${input.kind}".`)
    }
    case 'wait': {
      const timeoutMs = input.timeoutMs ?? WAIT_DEFAULT_TIMEOUT_MS
      if (typeof input.milliseconds === 'number') {
        await sleep(input.milliseconds)
        return {
          action: 'wait',
          currentUrl: getCurrentUrl(),
          waitedFor: `${input.milliseconds}ms`
        }
      }

      if (input.ref) {
        await waitForCondition({
          timeoutMs,
          evaluate: async () => {
            try {
              const objectId = await resolveObjectId(window, input.ref as string)
              return await callFunctionOn<boolean>({
                window,
                objectId,
                functionDeclaration: `
                  function() {
                    return Boolean(this.isConnected)
                  }
                `
              })
            } catch {
              return false
            }
          },
          failureMessage: `Timed out waiting for "${input.ref}".`
        })
        return {
          action: 'wait',
          currentUrl: getCurrentUrl(),
          waitedFor: input.ref
        }
      }

      if (input.text) {
        await waitForCondition({
          timeoutMs,
          evaluate: async () => {
            const bodyText = await evaluateInWindow<string>(
              window,
              '(document.body?.innerText || document.body?.textContent || "")'
            )
            return bodyText.includes(input.text ?? '')
          },
          failureMessage: `Timed out waiting for text "${input.text}".`
        })
        return {
          action: 'wait',
          currentUrl: getCurrentUrl(),
          waitedFor: input.text
        }
      }

      if (input.urlPattern) {
        const pattern = createUrlPatternRegExp(input.urlPattern)
        await waitForCondition({
          timeoutMs,
          evaluate: async () => pattern.test(getCurrentUrl()),
          failureMessage: `Timed out waiting for URL "${input.urlPattern}".`
        })
        return {
          action: 'wait',
          currentUrl: getCurrentUrl(),
          waitedFor: input.urlPattern
        }
      }

      if (input.loadState) {
        await waitForLoadState(window, input.loadState, timeoutMs)
        return {
          action: 'wait',
          currentUrl: getCurrentUrl(),
          waitedFor: input.loadState
        }
      }

      if (input.expression) {
        await waitForCondition({
          timeoutMs,
          evaluate: async () =>
            Boolean(await evaluateInWindow(window, input.expression ?? 'false')),
          failureMessage: `Timed out waiting for the browser expression to become truthy.`
        })
        return {
          action: 'wait',
          currentUrl: getCurrentUrl(),
          waitedFor: input.expression
        }
      }

      throw new Error(
        'Wait requires a ref, milliseconds, text, URL pattern, load state, or expression.'
      )
    }
  }
}

export async function launchTiaBrowserTool(
  options: TiaBrowserToolRuntimeOptions = {}
): Promise<void> {
  setTiaBrowserToolRuntimeOptions(options)
  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'launch requested', {
    partition: runtimeOptions.partition ?? DEFAULT_PARTITION,
    show: runtimeOptions.show ?? false
  })
  await ensurePlaceholderWindow()
}

export async function showTiaBrowserToolWindow(): Promise<void> {
  const currentWindow = await ensurePlaceholderWindow()
  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'show window requested', {
    currentUrl: readWindowUrl(currentWindow)
  })
  currentWindow.show()
  currentWindow.focus()
}

export async function hideTiaBrowserToolWindow(): Promise<void> {
  const currentWindow = await ensurePlaceholderWindow()
  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'hide window requested', {
    currentUrl: readWindowUrl(currentWindow)
  })
  currentWindow.hide()
}

export async function requestTiaBrowserToolHumanHandoff(
  input: TiaBrowserToolHumanHandoffRequest
): Promise<TiaBrowserToolHumanHandoffResult> {
  const currentWindow = await ensurePlaceholderWindow()
  const message = input.message.trim()
  if (message.length === 0) {
    throw new Error('Human handoff message must not be empty.')
  }

  if (pendingHandoff) {
    throw new Error('A tia-browser-tool human handoff is already in progress.')
  }

  const requestId = randomUUID()
  activeHandoff = {
    requestId,
    message,
    buttonLabel: input.buttonLabel?.trim() || 'Done, continue'
  }
  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'human handoff opened', {
    currentUrl: readWindowUrl(currentWindow),
    requestId,
    timeoutMs: input.timeoutMs ?? WAIT_DEFAULT_TIMEOUT_MS
  })
  currentWindow.show()
  currentWindow.focus()
  await injectHandoffOverlay(activeHandoff)

  return await new Promise<TiaBrowserToolHumanHandoffResult>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      if (!pendingHandoff || pendingHandoff.requestId !== requestId) {
        return
      }

      pendingHandoff = null
      activeHandoff = null
      void clearHandoffOverlay()
      tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'human handoff timed out', {
        currentUrl: getCurrentUrl(),
        requestId
      })
      resolve({
        status: 'timed_out',
        currentUrl: getCurrentUrl()
      })
    }, input.timeoutMs ?? WAIT_DEFAULT_TIMEOUT_MS)

    pendingHandoff = {
      requestId,
      resolve,
      reject,
      timeoutHandle
    }
  })
}

export async function runTiaBrowserToolAutomationCommand(
  input: BuiltInBrowserAutomationCommand
): Promise<BuiltInBrowserAutomationResult> {
  await ensurePlaceholderWindow()
  const startedAt = Date.now()
  tiaBrowserToolLog(
    TIA_BROWSER_TOOL_RUNTIME_SCOPE,
    'running automation command',
    summarizeAutomationCommand(input)
  )

  try {
    const result = await executeAutomationCommand(input)
    tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'automation command completed', {
      durationMs: Date.now() - startedAt,
      ...summarizeAutomationResult(result)
    })
    return result
  } catch (error) {
    tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'automation command failed', {
      durationMs: Date.now() - startedAt,
      command: summarizeAutomationCommand(input),
      error
    })
    throw error
  }
}

export function shutdownTiaBrowserTool(): void {
  tiaBrowserToolLog(TIA_BROWSER_TOOL_RUNTIME_SCOPE, 'shutdown requested')
  if (pendingHandoff) {
    clearTimeout(pendingHandoff.timeoutHandle)
    pendingHandoff.reject(new Error('TIA browser tool handoff aborted during shutdown.'))
    pendingHandoff = null
  }

  activeHandoff = null
  void clearHandoffOverlay()

  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.destroy()
  }

  browserWindow = null
  resetAutomationState()
  runtimeOptions = {}
}
