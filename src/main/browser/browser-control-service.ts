import {
  ipcMain,
  type Debugger,
  type IpcMain,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'
import {
  browserCdpIpcChannels,
  isBrowserCdpEventMethod,
  isBrowserCdpMethod,
  type BrowserCdpEventMethod,
  type BrowserCdpMethod,
  type BrowserCdpParams
} from '../../shared/browser-cdp'
import { normalizeBrowserUrl } from '../../shared/browser'

const CDP_PROTOCOL_VERSION = '1.3'
const MAX_CDP_PAYLOAD_BYTES = 256 * 1024
const MAX_CDP_KEYS = 128
const MAX_CDP_STRING_BYTES = 128 * 1024

type BrowserControlDebugger = Pick<
  Debugger,
  'attach' | 'detach' | 'isAttached' | 'sendCommand' | 'on' | 'removeListener'
>

export type BrowserControlWebContents = Pick<WebContents, 'isDestroyed' | 'send'> & {
  debugger: BrowserControlDebugger
}

export type BrowserControlWindow = {
  webContents: BrowserControlWebContents
  isDestroyed: () => boolean
}

type BrowserControlIpc = Pick<IpcMain, 'handle' | 'removeHandler'>

type CdpMessageListener = (
  event: unknown,
  method: string,
  params: unknown,
  sessionId?: string
) => void
type CdpDetachListener = (event: unknown, reason: string) => void

type RegisteredTarget = {
  webContents: BrowserControlWebContents
  attached: boolean
  messageListener?: CdpMessageListener
  detachListener?: CdpDetachListener
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function clonePayload(value: unknown, label: string): unknown {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new Error(`The CDP ${label} is not serializable`)
  }
  if (serialized === undefined) return null
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CDP_PAYLOAD_BYTES) {
    throw new Error(`The CDP ${label} exceeds the ${MAX_CDP_PAYLOAD_BYTES}-byte limit`)
  }
  try {
    return JSON.parse(serialized) as unknown
  } catch {
    throw new Error(`The CDP ${label} is not valid JSON`)
  }
}

function normalizeParams(value: unknown): BrowserCdpParams | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error('CDP params must be a plain object')
  if (Object.keys(value).length > MAX_CDP_KEYS) {
    throw new Error(`CDP params may contain at most ${MAX_CDP_KEYS} keys`)
  }
  return clonePayload(value, 'params') as BrowserCdpParams
}

function normalizeMethod(value: unknown): BrowserCdpMethod {
  if (!isBrowserCdpMethod(value)) {
    throw new Error('The requested CDP method is not allowed')
  }
  return value
}

function normalizeEventParams(value: unknown): unknown | undefined {
  try {
    return clonePayload(value, 'event payload')
  } catch {
    // A noisy or unexpectedly large event should not tear down browser control.
    return undefined
  }
}

function validateMethodParams(
  method: BrowserCdpMethod,
  params: BrowserCdpParams | undefined
): BrowserCdpParams | undefined {
  if (method === 'Page.navigate') {
    const rawUrl = params?.url
    if (typeof rawUrl !== 'string') {
      throw new Error('Page.navigate requires a URL')
    }
    const url = normalizeBrowserUrl(rawUrl)
    if (!url) {
      throw new Error('CDP navigation only permits http://, https://, and about:blank URLs')
    }
    return { ...params, url }
  }

  if (method === 'Runtime.evaluate' || method === 'Runtime.callFunctionOn') {
    const expression = params?.expression ?? params?.functionDeclaration
    if (typeof expression !== 'string' || !expression.trim()) {
      throw new Error(`${method} requires a JavaScript expression`)
    }
    if (Buffer.byteLength(expression, 'utf8') > MAX_CDP_STRING_BYTES) {
      throw new Error(`The ${method} expression is too large`)
    }
  }

  return params
}

export class BrowserControlService {
  private readonly targets = new Map<string, RegisteredTarget>()
  private readonly boundCommand: (
    event: IpcMainInvokeEvent,
    tabId: unknown,
    method: unknown,
    params: unknown
  ) => Promise<unknown>
  private disposed = false

  constructor(
    private readonly browserWindow: BrowserControlWindow,
    private readonly ipc: BrowserControlIpc = ipcMain
  ) {
    this.boundCommand = async (event, tabId, method, params) => {
      this.assertSender(event)
      return this.executeCommand(this.readTabId(tabId), normalizeMethod(method), params)
    }
    this.ipc.handle(browserCdpIpcChannels.command, this.boundCommand)
  }

  registerTab(tabId: string, webContents: BrowserControlWebContents): void {
    this.ensureUsable()
    if (!tabId.trim() || tabId.length > 128) throw new Error('Browser tab id is required')
    this.unregisterTab(tabId)
    this.targets.set(tabId, {
      webContents,
      attached: false
    })
  }

  unregisterTab(tabId: string): void {
    const target = this.targets.get(tabId)
    if (!target) return
    this.targets.delete(tabId)
    this.detachTarget(target)
  }

  async executeCommand(
    tabId: string,
    method: BrowserCdpMethod,
    rawParams?: unknown
  ): Promise<unknown> {
    this.ensureUsable()
    const normalizedTabId = this.readTabId(tabId)
    const allowedMethod = normalizeMethod(method)
    const target = this.targets.get(normalizedTabId)
    if (!target) throw new Error('Browser tab not found')
    if (target.webContents.isDestroyed()) throw new Error('Browser tab is unavailable')

    const params = validateMethodParams(allowedMethod, normalizeParams(rawParams))
    this.attachTarget(normalizedTabId, target)
    try {
      const result = await target.webContents.debugger.sendCommand(allowedMethod, params)
      return clonePayload(result, 'response')
    } catch (error) {
      throw new Error(errorMessage(error, `CDP command ${allowedMethod} failed`))
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.ipc.removeHandler(browserCdpIpcChannels.command)
    for (const [tabId, target] of this.targets) {
      this.targets.delete(tabId)
      this.detachTarget(target)
    }
  }

  private attachTarget(tabId: string, target: RegisteredTarget): void {
    const debuggerInstance = target.webContents.debugger
    if (target.attached && debuggerInstance.isAttached()) return

    const messageListener = (
      _event: unknown,
      method: string,
      params: unknown,
      sessionId?: string
    ): void => {
      this.handleMessage(tabId, target, method, params, sessionId)
    }
    const detachListener = (_event: unknown, reason: string): void => {
      this.handleDetach(tabId, target, reason)
    }
    target.messageListener = messageListener
    target.detachListener = detachListener
    debuggerInstance.on('message', messageListener)
    debuggerInstance.on('detach', detachListener)

    try {
      debuggerInstance.attach(CDP_PROTOCOL_VERSION)
      target.attached = true
    } catch (error) {
      this.removeDebuggerListeners(target)
      target.messageListener = undefined
      target.detachListener = undefined
      throw new Error(errorMessage(error, 'Could not attach the browser debugger'))
    }
  }

  private handleMessage(
    tabId: string,
    target: RegisteredTarget,
    method: string,
    params: unknown,
    sessionId?: string
  ): void {
    if (this.disposed || this.targets.get(tabId) !== target || !isBrowserCdpEventMethod(method)) {
      return
    }
    const normalizedParams = normalizeEventParams(params)
    if (normalizedParams === undefined) return
    const event: {
      tabId: string
      method: BrowserCdpEventMethod
      params: unknown
      sessionId?: string
    } = {
      tabId,
      method,
      params: normalizedParams,
      ...(typeof sessionId === 'string' && sessionId.length <= 128 ? { sessionId } : {})
    }
    if (this.browserWindow.isDestroyed() || this.browserWindow.webContents.isDestroyed()) return
    try {
      this.browserWindow.webContents.send(browserCdpIpcChannels.event, event)
    } catch {
      // Renderer teardown can race the debugger event. The tab remains usable.
    }
  }

  private handleDetach(tabId: string, target: RegisteredTarget, reason: string): void {
    target.attached = false
    this.removeDebuggerListeners(target)
    target.messageListener = undefined
    target.detachListener = undefined
    if (this.disposed || this.targets.get(tabId) !== target) return
    if (this.browserWindow.isDestroyed() || this.browserWindow.webContents.isDestroyed()) return
    try {
      this.browserWindow.webContents.send(browserCdpIpcChannels.detached, {
        tabId,
        reason: reason || 'Debugger detached'
      })
    } catch {
      // Renderer teardown can race debugger cleanup.
    }
  }

  private detachTarget(target: RegisteredTarget): void {
    this.removeDebuggerListeners(target)
    target.messageListener = undefined
    target.detachListener = undefined
    target.attached = false
    try {
      if (target.webContents.debugger.isAttached()) target.webContents.debugger.detach()
    } catch {
      // The target may already have been destroyed or detached by DevTools.
    }
  }

  private removeDebuggerListeners(target: RegisteredTarget): void {
    if (target.messageListener) {
      target.webContents.debugger.removeListener('message', target.messageListener)
    }
    if (target.detachListener) {
      target.webContents.debugger.removeListener('detach', target.detachListener)
    }
  }

  private readTabId(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 128) {
      throw new Error('Browser tab id is required')
    }
    return value
  }

  private assertSender(event: IpcMainInvokeEvent): void {
    if (event.sender !== this.browserWindow.webContents || this.disposed) {
      throw new Error('Invalid browser CDP IPC sender')
    }
  }

  private ensureUsable(): void {
    if (this.disposed || this.browserWindow.isDestroyed()) {
      throw new Error('Browser control is unavailable')
    }
  }
}
