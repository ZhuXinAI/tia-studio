// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AboutSettingsPage } from './about-settings-page'

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

type AutoUpdateState = {
  enabled: boolean
  status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'unsupported' | 'error'
  availableVersion: string | null
  lastCheckedAt: string | null
  message: string | null
}

type GetAutoUpdateStateFn = () => Promise<AutoUpdateState>
type SetAutoUpdateEnabledFn = (enabled: boolean) => Promise<AutoUpdateState>
type CheckForUpdatesFn = () => Promise<AutoUpdateState>

describe('about settings page', () => {
  let container: HTMLDivElement
  let root: Root
  let getAutoUpdateState: ReturnType<typeof vi.fn<GetAutoUpdateStateFn>>
  let setAutoUpdateEnabled: ReturnType<typeof vi.fn<SetAutoUpdateEnabledFn>>
  let checkForUpdates: ReturnType<typeof vi.fn<CheckForUpdatesFn>>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    getAutoUpdateState = vi.fn<GetAutoUpdateStateFn>(async () => ({
      enabled: false,
      status: 'idle',
      availableVersion: null,
      lastCheckedAt: null,
      message: null
    }))
    setAutoUpdateEnabled = vi.fn<SetAutoUpdateEnabledFn>(async (enabled: boolean) => ({
      enabled,
      status: 'idle',
      availableVersion: null,
      lastCheckedAt: null,
      message: null
    }))
    checkForUpdates = vi.fn<CheckForUpdatesFn>(async () => ({
      enabled: false,
      status: 'up-to-date',
      availableVersion: null,
      lastCheckedAt: '2026-03-03T00:00:00.000Z',
      message: 'You are up to date.'
    }))

    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'token'
      })),
      getAppInfo: vi.fn(async () => ({
        name: 'tia-studio',
        version: '1.7.22'
      })),
      pickDirectory: vi.fn(async () => null),
      getAutoUpdateState,
      setAutoUpdateEnabled,
      checkForUpdates
    }
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

    expect(window.tiaDesktop.getAppInfo).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Tia Studio')
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

    expect(getAutoUpdateState).toHaveBeenCalledTimes(1)

    const autoUpdateSwitch = container.querySelector(
      '[aria-label="Toggle Auto Update"]'
    ) as HTMLButtonElement | null
    expect(autoUpdateSwitch).not.toBeNull()
    expect(autoUpdateSwitch?.getAttribute('aria-checked')).toBe('false')

    await act(async () => {
      autoUpdateSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(setAutoUpdateEnabled).toHaveBeenCalledWith(true)
  })

  it('checks for updates from the button', async () => {
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
})
