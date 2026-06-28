// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AboutSettingsPage } from './about-settings-page'
import { getDesktopAppInfo } from '../../../lib/desktop-features'
import { useAutoUpdate } from '../auto-update/use-auto-update'

vi.mock('../../../lib/desktop-features', () => ({
  getDesktopAppInfo: vi.fn()
}))

vi.mock('../auto-update/use-auto-update', () => ({
  useAutoUpdate: vi.fn()
}))

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('about settings page', () => {
  let container: HTMLDivElement
  let root: Root
  let toggleAutoUpdate: ReturnType<typeof vi.fn<() => Promise<void>>>
  let checkForUpdates: ReturnType<typeof vi.fn<() => Promise<void>>>
  let restartToUpdate: ReturnType<typeof vi.fn<() => Promise<void>>>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    toggleAutoUpdate = vi.fn(async () => undefined)
    checkForUpdates = vi.fn(async () => undefined)
    restartToUpdate = vi.fn(async () => undefined)

    vi.mocked(getDesktopAppInfo).mockResolvedValue({
      name: 'TIA Studio',
      version: '1.7.22'
    })
    vi.mocked(useAutoUpdate).mockReturnValue({
      autoUpdateState: {
        enabled: false,
        status: 'idle',
        availableVersion: null,
        lastCheckedAt: null,
        message: null
      },
      hasDownloadedUpdate: false,
      isSavingAutoUpdate: false,
      isCheckingForUpdates: false,
      isRestartingToUpdate: false,
      toggleAutoUpdate,
      checkForUpdates,
      restartToUpdate
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('renders desktop app name and version from electron metadata', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AboutSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(getDesktopAppInfo).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('TIA Studio')
    expect(container.textContent).toContain('v1.7.22')
  })

  it('loads and toggles auto update', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AboutSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const autoUpdateSwitch = container.querySelector(
      '[aria-label="Toggle Auto Update"]'
    ) as HTMLButtonElement | null
    expect(autoUpdateSwitch).not.toBeNull()
    expect(autoUpdateSwitch?.getAttribute('aria-checked')).toBe('false')

    await act(async () => {
      autoUpdateSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(toggleAutoUpdate).toHaveBeenCalledTimes(1)
  })

  it('checks for updates from the button', async () => {
    vi.mocked(useAutoUpdate).mockReturnValue({
      autoUpdateState: {
        enabled: false,
        status: 'up-to-date',
        availableVersion: null,
        lastCheckedAt: '2026-03-03T00:00:00.000Z',
        message: 'You are up to date.'
      },
      hasDownloadedUpdate: false,
      isSavingAutoUpdate: false,
      isCheckingForUpdates: false,
      isRestartingToUpdate: false,
      toggleAutoUpdate,
      checkForUpdates,
      restartToUpdate
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AboutSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const checkUpdateButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Check Update')
    )
    expect(checkUpdateButton).toBeDefined()

    await act(async () => {
      checkUpdateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('You are up to date.')
  })

  it('switches to a restart button when the updater reports a downloaded update', async () => {
    vi.mocked(useAutoUpdate).mockReturnValue({
      autoUpdateState: {
        enabled: true,
        status: 'update-downloaded',
        availableVersion: '1.8.0',
        lastCheckedAt: '2026-03-03T00:00:00.000Z',
        message: 'Update 1.8.0 is ready to install. Restart TIA Studio to finish updating.'
      },
      hasDownloadedUpdate: true,
      isSavingAutoUpdate: false,
      isCheckingForUpdates: false,
      isRestartingToUpdate: false,
      toggleAutoUpdate,
      checkForUpdates,
      restartToUpdate
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AboutSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const restartButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Restart to update')
    )
    expect(restartButton).toBeDefined()

    await act(async () => {
      restartButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(restartToUpdate).toHaveBeenCalledTimes(1)
  })
})
