// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appEntryLoader } from '../routes/app-entry-loader'
import { AppShell } from './app-shell'

type AutoUpdateState = {
  enabled: boolean
  status:
    | 'idle'
    | 'checking'
    | 'update-available'
    | 'update-downloaded'
    | 'up-to-date'
    | 'unsupported'
    | 'error'
  availableVersion: string | null
  lastCheckedAt: string | null
  message: string | null
}

type GetAutoUpdateStateFn = () => Promise<AutoUpdateState>
type RestartToUpdateFn = () => Promise<void>
type OnAutoUpdateStateChangedFn = (listener: (state: AutoUpdateState) => void) => () => void

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('AppShell update button', () => {
  let container: HTMLDivElement
  let root: Root
  let getAutoUpdateState: ReturnType<typeof vi.fn<GetAutoUpdateStateFn>>
  let restartToUpdate: ReturnType<typeof vi.fn<RestartToUpdateFn>>
  let onAutoUpdateStateChanged: ReturnType<typeof vi.fn<OnAutoUpdateStateChangedFn>>
  let autoUpdateStateListener: ((state: AutoUpdateState) => void) | null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    getAutoUpdateState = vi.fn<GetAutoUpdateStateFn>(async () => ({
      enabled: true,
      status: 'idle',
      availableVersion: null,
      lastCheckedAt: null,
      message: null
    }))
    restartToUpdate = vi.fn<RestartToUpdateFn>(async () => undefined)
    autoUpdateStateListener = null
    onAutoUpdateStateChanged = vi.fn<OnAutoUpdateStateChangedFn>((listener) => {
      autoUpdateStateListener = listener

      return () => {
        if (autoUpdateStateListener === listener) {
          autoUpdateStateListener = null
        }
      }
    })

    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'token'
      })),
      pickDirectory: vi.fn(async () => null),
      getAutoUpdateState,
      restartToUpdate,
      onAutoUpdateStateChanged
    }
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    window.localStorage.clear()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('shows the update button when a downloaded update is reported and restarts on click', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppShell />,
          children: [
            {
              index: true,
              element: <div>Content</div>
            }
          ]
        }
      ],
      {
        initialEntries: ['/']
      }
    )

    await act(async () => {
      root.render(<RouterProvider router={router} />)
    })
    await flushAsyncWork()

    expect(getAutoUpdateState).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain('Update')

    await act(async () => {
      autoUpdateStateListener?.({
        enabled: true,
        status: 'update-downloaded',
        availableVersion: '0.2.2',
        lastCheckedAt: '2026-03-17T00:00:00.000Z',
        message: 'Update 0.2.2 is ready to install. Restart TIA Studio to finish updating.'
      })
    })

    const updateButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Update')
    )
    expect(updateButton).toBeDefined()

    await act(async () => {
      updateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(restartToUpdate).toHaveBeenCalledTimes(1)
  })

  it('defaults first-run entry to /team when no app mode has been stored', () => {
    const response = appEntryLoader()

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/team')
  })
})
