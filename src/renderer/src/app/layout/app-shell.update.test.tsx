// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './app-shell'
import { useAutoUpdate } from '../../features/settings/auto-update/use-auto-update'

vi.mock('../../features/settings/auto-update/use-auto-update', () => ({
  useAutoUpdate: vi.fn()
}))

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('AppShell update button', () => {
  let container: HTMLDivElement
  let root: Root
  let restartToUpdate: ReturnType<typeof vi.fn<() => Promise<void>>>
  let queryClient: QueryClient

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    })
    restartToUpdate = vi.fn(async () => undefined)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('shows the update button when a downloaded update is reported and restarts on click', async () => {
    vi.mocked(useAutoUpdate).mockReturnValue({
      autoUpdateState: {
        enabled: true,
        status: 'update-downloaded',
        availableVersion: '0.2.2',
        lastCheckedAt: '2026-03-17T00:00:00.000Z',
        message: 'Update 0.2.2 is ready to install. Restart TIA Studio to finish updating.'
      },
      hasDownloadedUpdate: true,
      isSavingAutoUpdate: false,
      isCheckingForUpdates: false,
      isRestartingToUpdate: false,
      toggleAutoUpdate: vi.fn(async () => undefined),
      checkForUpdates: vi.fn(async () => undefined),
      restartToUpdate
    })

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
      root.render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      )
    })
    await flushAsyncWork()

    const updateButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Update')
    )
    expect(updateButton).toBeDefined()

    await act(async () => {
      updateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(restartToUpdate).toHaveBeenCalledTimes(1)
  })
})
