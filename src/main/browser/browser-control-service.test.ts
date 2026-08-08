import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { BrowserControlWebContents, BrowserControlWindow } from './browser-control-service'
import { BrowserControlService } from './browser-control-service'

class FakeDebugger extends EventEmitter {
  attached = false
  readonly attach = vi.fn(() => {
    this.attached = true
  })
  readonly detach = vi.fn(() => {
    this.attached = false
    this.emit('detach', {}, 'target closed')
  })
  readonly isAttached = vi.fn(() => this.attached)
  readonly sendCommand = vi.fn(async (method: string) => ({
    method,
    result: { type: 'string', value: 'ok' }
  }))
}

function createHarness() {
  const debuggerInstance = new FakeDebugger()
  const webContents = {
    debugger: debuggerInstance,
    isDestroyed: vi.fn(() => false),
    send: vi.fn()
  } as unknown as BrowserControlWebContents
  const browserWindow = {
    webContents,
    isDestroyed: vi.fn(() => false)
  } as unknown as BrowserControlWindow
  const ipc = {
    handle: vi.fn(),
    removeHandler: vi.fn()
  }
  const service = new BrowserControlService(browserWindow, ipc as never)
  service.registerTab('tab-1', webContents)
  return { debuggerInstance, webContents, browserWindow, ipc, service }
}

describe('BrowserControlService', () => {
  it('attaches lazily and exposes allowlisted Runtime and DOM commands', async () => {
    const { debuggerInstance, service } = createHarness()

    await expect(
      service.executeCommand('tab-1', 'Runtime.evaluate', {
        expression: 'document.title',
        returnByValue: true
      })
    ).resolves.toEqual({ method: 'Runtime.evaluate', result: { type: 'string', value: 'ok' } })
    await expect(service.executeCommand('tab-1', 'DOM.getDocument')).resolves.toEqual(
      expect.objectContaining({ method: 'DOM.getDocument' })
    )
    await expect(service.executeCommand('tab-1', 'Page.captureScreenshot')).resolves.toEqual(
      expect.objectContaining({ method: 'Page.captureScreenshot' })
    )

    expect(debuggerInstance.attach).toHaveBeenCalledTimes(1)
    expect(debuggerInstance.attach).toHaveBeenCalledWith('1.3')
    expect(debuggerInstance.sendCommand).toHaveBeenNthCalledWith(1, 'Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true
    })
  })

  it('enforces the browser navigation policy even when navigation comes through CDP', async () => {
    const { debuggerInstance, service } = createHarness()

    await expect(
      service.executeCommand('tab-1', 'Page.navigate', { url: 'file:///etc/passwd' })
    ).rejects.toThrow('only permits')
    expect(debuggerInstance.sendCommand).not.toHaveBeenCalled()

    await service.executeCommand('tab-1', 'Page.navigate', { url: 'https://example.com' })
    expect(debuggerInstance.sendCommand).toHaveBeenCalledWith('Page.navigate', {
      url: 'https://example.com/'
    })
  })

  it('forwards only approved events and detaches listeners when a tab closes', async () => {
    const { debuggerInstance, webContents, service } = createHarness()
    await service.executeCommand('tab-1', 'Runtime.enable')

    debuggerInstance.emit(
      'message',
      {},
      'Runtime.consoleAPICalled',
      { type: 'log', args: [] },
      'session-1'
    )
    debuggerInstance.emit('message', {}, 'Network.responseReceived', { headers: { secret: 'no' } })

    expect(webContents.send).toHaveBeenCalledTimes(1)
    expect(webContents.send).toHaveBeenCalledWith(
      'tia-browser:cdp-event',
      expect.objectContaining({
        tabId: 'tab-1',
        method: 'Runtime.consoleAPICalled',
        sessionId: 'session-1'
      })
    )

    service.unregisterTab('tab-1')
    expect(debuggerInstance.detach).toHaveBeenCalledTimes(1)
    debuggerInstance.emit('message', {}, 'Runtime.consoleAPICalled', { type: 'log' })
    expect(webContents.send).toHaveBeenCalledTimes(1)
  })

  it('reports an external debugger detach without losing the tab registration', async () => {
    const { debuggerInstance, webContents, service } = createHarness()
    await service.executeCommand('tab-1', 'Runtime.enable')

    debuggerInstance.attached = false
    debuggerInstance.emit('detach', {}, 'DevTools opened')

    expect(webContents.send).toHaveBeenCalledWith('tia-browser:cdp-detached', {
      tabId: 'tab-1',
      reason: 'DevTools opened'
    })
    debuggerInstance.attached = true
    await service.executeCommand('tab-1', 'Runtime.enable')
    expect(debuggerInstance.attach).toHaveBeenCalledTimes(2)
  })

  it('rejects non-object params and disallowed methods before attaching', async () => {
    const { debuggerInstance, service } = createHarness()

    await expect(
      service.executeCommand('tab-1', 'Runtime.enable', ['not-an-object'] as never)
    ).rejects.toThrow('plain object')
    await expect(service.executeCommand('tab-1', 'Target.getTargets' as never)).rejects.toThrow(
      'not allowed'
    )
    expect(debuggerInstance.attach).not.toHaveBeenCalled()
  })
})
