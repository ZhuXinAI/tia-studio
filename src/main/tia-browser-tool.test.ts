import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronHarness = vi.hoisted(() => {
  class TestEventEmitter {
    private listeners = new Map<string, Set<(...args: unknown[]) => void>>()

    on(event: string, listener: (...args: unknown[]) => void): this {
      const eventListeners = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>()
      eventListeners.add(listener)
      this.listeners.set(event, eventListeners)
      return this
    }

    once(event: string, listener: (...args: unknown[]) => void): this {
      const wrappedListener = (...args: unknown[]) => {
        this.off(event, wrappedListener)
        listener(...args)
      }

      return this.on(event, wrappedListener)
    }

    off(event: string, listener: (...args: unknown[]) => void): this {
      this.listeners.get(event)?.delete(listener)
      return this
    }

    emit(event: string, ...args: unknown[]): boolean {
      const eventListeners = this.listeners.get(event)
      if (!eventListeners || eventListeners.size === 0) {
        return false
      }

      for (const listener of [...eventListeners]) {
        listener(...args)
      }

      return true
    }
  }

  const loadURLMock = vi.fn(async function (this: { webContents: MockWebContents }, url: string) {
    this.webContents.url = url
    this.webContents.emit('dom-ready')
  })
  const sendCommandMock = vi.fn(async (method: string, params?: Record<string, unknown>) => {
    void method
    void params
    return {}
  })
  const constructorOptions: unknown[] = []

  class MockDebugger extends TestEventEmitter {
    private attached = false

    isAttached(): boolean {
      return this.attached
    }

    attach(): void {
      this.attached = true
    }

    async sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown> {
      return await sendCommandMock(method, params)
    }
  }

  class MockWebContents extends TestEventEmitter {
    url = ''
    debugger = new MockDebugger()
    private destroyed = false

    isDestroyed(): boolean {
      return this.destroyed
    }

    markDestroyed(): void {
      this.destroyed = true
    }

    getURL(): string {
      if (this.destroyed) {
        throw new Error('Object has been destroyed')
      }

      return this.url
    }

    getTitle(): string {
      if (this.destroyed) {
        throw new Error('Object has been destroyed')
      }

      return ''
    }

    setWindowOpenHandler(): void {
      return undefined
    }

    async executeJavaScript(): Promise<void> {
      return undefined
    }

    sendInputEvent(): void {
      return undefined
    }
  }

  class MockBrowserWindow extends TestEventEmitter {
    webContents = new MockWebContents()
    private destroyed = false

    constructor(options: unknown) {
      super()
      constructorOptions.push(options)
    }

    async loadURL(url: string): Promise<void> {
      await loadURLMock.call(this, url)
    }

    isDestroyed(): boolean {
      return this.destroyed
    }

    destroy(): void {
      this.destroyed = true
      this.webContents.markDestroyed()
      this.emit('closed')
    }

    show(): void {
      return undefined
    }

    hide(): void {
      return undefined
    }

    focus(): void {
      return undefined
    }
  }

  return {
    BrowserWindow: MockBrowserWindow,
    constructorOptions,
    loadURLMock,
    sendCommandMock
  }
})

vi.mock('electron', () => ({
  BrowserWindow: electronHarness.BrowserWindow
}))

describe('tia-browser-tool', () => {
  let runtime: typeof import('./tia-browser-tool') | null = null

  beforeEach(() => {
    electronHarness.constructorOptions.length = 0
    electronHarness.loadURLMock.mockClear()
    electronHarness.sendCommandMock.mockClear()
  })

  afterEach(() => {
    runtime?.shutdownTiaBrowserTool()
    runtime = null
    vi.resetModules()
  })

  it('waits for the initial page load before enabling the debugger network domain', async () => {
    runtime = await import('./tia-browser-tool')

    await runtime.launchTiaBrowserTool()

    expect(electronHarness.loadURLMock).toHaveBeenCalledWith('about:blank')
    expect(electronHarness.sendCommandMock).toHaveBeenCalledWith('Network.enable', undefined)
    expect(electronHarness.loadURLMock.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      electronHarness.sendCommandMock.mock.invocationCallOrder[0] ?? 0
    )
  })

  it('uses the configured show preference when creating the browser window', async () => {
    runtime = await import('./tia-browser-tool')

    await runtime.launchTiaBrowserTool({
      show: true
    })

    expect(electronHarness.constructorOptions[0]).toMatchObject({
      show: true
    })
  })

  it('does not crash when replacing the current window during open', async () => {
    runtime = await import('./tia-browser-tool')

    await runtime.launchTiaBrowserTool()

    await expect(
      runtime.runTiaBrowserToolAutomationCommand({
        action: 'open',
        url: 'https://example.test'
      })
    ).resolves.toMatchObject({
      action: 'open',
      currentUrl: 'https://example.test'
    })
  })
})
