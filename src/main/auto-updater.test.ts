import { describe, expect, it, vi } from 'vitest'
import { AutoUpdateService } from './auto-updater'

type FakeApp = {
  isPackaged: boolean
  getPath: (name: 'userData') => string
  getVersion: () => string
}

type CheckForUpdatesFn = () => Promise<{
  updateInfo?: {
    version?: string
  }
} | null>

type FakeUpdater = {
  autoDownload: boolean
  checkForUpdates: CheckForUpdatesFn
  checkForUpdatesMock: ReturnType<typeof vi.fn<CheckForUpdatesFn>>
}

function createAppStub(overrides?: Partial<FakeApp>): FakeApp {
  return {
    isPackaged: true,
    getPath: () => '/tmp/tia',
    getVersion: () => '1.0.0',
    ...overrides
  }
}

function createUpdaterStub(
  overrides?: Partial<Omit<FakeUpdater, 'checkForUpdates'>> & {
    checkForUpdatesMock?: ReturnType<typeof vi.fn<CheckForUpdatesFn>>
  }
): FakeUpdater {
  const checkForUpdatesMock =
    overrides?.checkForUpdatesMock ??
    vi.fn<CheckForUpdatesFn>(async () => ({
      updateInfo: {
        version: '1.0.0'
      }
    }))

  return {
    autoDownload: true,
    checkForUpdates: () => checkForUpdatesMock(),
    checkForUpdatesMock,
    ...overrides
  }
}

describe('auto update service', () => {
  it('initializes from persisted settings and applies autoDownload', async () => {
    const readFile = vi.fn(async () => '{"autoUpdateEnabled":false}')
    const writeFile = vi.fn(async () => undefined)
    const updater = createUpdaterStub()
    const service = new AutoUpdateService({
      app: createAppStub(),
      updater,
      readFile,
      writeFile,
      settingsFilePath: '/tmp/tia/auto-update.json'
    })

    await service.init()

    expect(service.getState().enabled).toBe(false)
    expect(updater.autoDownload).toBe(false)
  })

  it('returns unsupported status for unpackaged apps', async () => {
    const updater = createUpdaterStub()
    const service = new AutoUpdateService({
      app: createAppStub({ isPackaged: false }),
      updater,
      readFile: vi.fn(async () => '{"autoUpdateEnabled":true}'),
      writeFile: vi.fn(async () => undefined),
      settingsFilePath: '/tmp/tia/auto-update.json'
    })
    await service.init()

    const state = await service.checkForUpdates()

    expect(state.status).toBe('unsupported')
    expect(updater.checkForUpdatesMock).not.toHaveBeenCalled()
  })

  it('checks for updates and persists enabled changes', async () => {
    const readFile = vi.fn(async () => '{"autoUpdateEnabled":true}')
    const writeFile = vi.fn(async () => undefined)
    const checkForUpdatesMock = vi.fn<CheckForUpdatesFn>(async () => ({
      updateInfo: {
        version: '1.1.0'
      }
    }))
    const updater = createUpdaterStub({
      checkForUpdatesMock
    })
    const service = new AutoUpdateService({
      app: createAppStub(),
      updater,
      readFile,
      writeFile,
      settingsFilePath: '/tmp/tia/auto-update.json'
    })
    await service.init()

    const checkedState = await service.checkForUpdates()
    const toggledState = await service.setEnabled(false)

    expect(checkedState.status).toBe('update-available')
    expect(checkedState.availableVersion).toBe('1.1.0')
    expect(toggledState.enabled).toBe(false)
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/tia/auto-update.json',
      '{\n  "autoUpdateEnabled": false\n}',
      'utf8'
    )
    expect(updater.autoDownload).toBe(false)
  })
})
