import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TiaBrowserToolManager } from './tia-browser-tool-manager'

const {
  launchTiaBrowserToolMock,
  setTiaBrowserToolRuntimeOptionsMock,
  showTiaBrowserToolWindowMock,
  hideTiaBrowserToolWindowMock,
  requestTiaBrowserToolHumanHandoffMock,
  runTiaBrowserToolAutomationCommandMock,
  shutdownTiaBrowserToolMock
} = vi.hoisted(() => ({
  launchTiaBrowserToolMock: vi.fn(),
  setTiaBrowserToolRuntimeOptionsMock: vi.fn(),
  showTiaBrowserToolWindowMock: vi.fn(),
  hideTiaBrowserToolWindowMock: vi.fn(),
  requestTiaBrowserToolHumanHandoffMock: vi.fn(),
  runTiaBrowserToolAutomationCommandMock: vi.fn(),
  shutdownTiaBrowserToolMock: vi.fn()
}))

vi.mock('./tia-browser-tool', () => ({
  launchTiaBrowserTool: (options: unknown) => launchTiaBrowserToolMock(options),
  setTiaBrowserToolRuntimeOptions: (options: unknown) =>
    setTiaBrowserToolRuntimeOptionsMock(options),
  showTiaBrowserToolWindow: () => showTiaBrowserToolWindowMock(),
  hideTiaBrowserToolWindow: () => hideTiaBrowserToolWindowMock(),
  requestTiaBrowserToolHumanHandoff: (input: unknown) =>
    requestTiaBrowserToolHumanHandoffMock(input),
  runTiaBrowserToolAutomationCommand: (input: unknown) =>
    runTiaBrowserToolAutomationCommandMock(input),
  shutdownTiaBrowserTool: () => shutdownTiaBrowserToolMock()
}))

describe('TiaBrowserToolManager', () => {
  beforeEach(() => {
    launchTiaBrowserToolMock.mockReset().mockResolvedValue(undefined)
    setTiaBrowserToolRuntimeOptionsMock.mockReset()
    showTiaBrowserToolWindowMock.mockReset().mockResolvedValue(undefined)
    hideTiaBrowserToolWindowMock.mockReset().mockResolvedValue(undefined)
    requestTiaBrowserToolHumanHandoffMock.mockReset()
    runTiaBrowserToolAutomationCommandMock.mockReset()
    shutdownTiaBrowserToolMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('launches the in-process tia browser tool once with the requested runtime options', async () => {
    const manager = new TiaBrowserToolManager({
      partition: 'persist:tia-browser-tool-test',
      show: true
    })

    await Promise.all([manager.launch(), manager.launch()])

    expect(launchTiaBrowserToolMock).toHaveBeenCalledTimes(1)
    expect(launchTiaBrowserToolMock).toHaveBeenCalledWith({
      partition: 'persist:tia-browser-tool-test',
      show: true
    })
  })

  it('updates the runtime options without forcing a launch', async () => {
    const manager = new TiaBrowserToolManager({
      show: false
    })

    manager.setRuntimeOptions({
      show: true
    })

    expect(manager.isLaunched()).toBe(false)
    expect(setTiaBrowserToolRuntimeOptionsMock).toHaveBeenCalledWith({
      show: true
    })
    await manager.launch()
    expect(launchTiaBrowserToolMock).toHaveBeenCalledWith({
      show: true
    })
  })

  it('delegates window visibility commands to the in-process runtime', async () => {
    const manager = new TiaBrowserToolManager()

    await manager.showWindow()
    await manager.hideWindow()

    expect(launchTiaBrowserToolMock).toHaveBeenCalledTimes(1)
    expect(showTiaBrowserToolWindowMock).toHaveBeenCalledTimes(1)
    expect(hideTiaBrowserToolWindowMock).toHaveBeenCalledTimes(1)
    expect(showTiaBrowserToolWindowMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      launchTiaBrowserToolMock.mock.invocationCallOrder[0] ?? 0
    )
  })

  it('delegates human handoff requests to the in-process runtime', async () => {
    requestTiaBrowserToolHumanHandoffMock.mockResolvedValue({
      status: 'completed',
      currentUrl: 'https://example.test/account'
    })

    const manager = new TiaBrowserToolManager()

    await expect(
      manager.requestHumanHandoff({
        message: '  Please finish logging in.  '
      })
    ).resolves.toEqual({
      status: 'completed',
      currentUrl: 'https://example.test/account'
    })

    expect(requestTiaBrowserToolHumanHandoffMock).toHaveBeenCalledWith({
      message: 'Please finish logging in.',
      buttonLabel: 'Done, continue',
      timeoutMs: 900000
    })
  })

  it('rejects empty human handoff messages before touching the runtime', async () => {
    const manager = new TiaBrowserToolManager()

    await expect(
      manager.requestHumanHandoff({
        message: '   '
      })
    ).rejects.toThrow('Human handoff message must not be empty.')

    expect(launchTiaBrowserToolMock).not.toHaveBeenCalled()
    expect(requestTiaBrowserToolHumanHandoffMock).not.toHaveBeenCalled()
  })

  it('delegates automation commands to the in-process runtime', async () => {
    runTiaBrowserToolAutomationCommandMock.mockResolvedValue({
      action: 'snapshot',
      currentUrl: 'https://example.test',
      snapshot: '- button "Continue" [ref=e1]'
    })

    const manager = new TiaBrowserToolManager()

    await expect(
      manager.runAutomationCommand({
        action: 'snapshot',
        interactive: true
      })
    ).resolves.toEqual({
      action: 'snapshot',
      currentUrl: 'https://example.test',
      snapshot: '- button "Continue" [ref=e1]'
    })

    expect(runTiaBrowserToolAutomationCommandMock).toHaveBeenCalledWith({
      action: 'snapshot',
      interactive: true
    })
  })

  it('resets launch state on shutdown so later calls can relaunch', async () => {
    const manager = new TiaBrowserToolManager()

    await manager.launch()
    manager.shutdown()
    await manager.launch()

    expect(shutdownTiaBrowserToolMock).toHaveBeenCalledTimes(1)
    expect(launchTiaBrowserToolMock).toHaveBeenCalledTimes(2)
  })
})
