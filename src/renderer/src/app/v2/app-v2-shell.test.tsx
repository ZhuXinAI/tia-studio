// @vitest-environment jsdom

import { act, useMemo } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppV2Shell } from './app-v2-shell'
import { useAppV2ShellStatusBar } from './app-v2-shell-status'

vi.mock('./app-v2-sidebar', () => ({
  AppV2Sidebar: () => <aside>Sidebar</aside>
}))

function ChatRoute(): React.JSX.Element {
  const statusContent = useMemo(() => <span>Live thread status</span>, [])
  useAppV2ShellStatusBar(statusContent)
  return <div>Chat route</div>
}

async function flushReact(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('AppV2Shell status bar', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('shows route-provided thread status and falls back to shell defaults after route changes', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppV2Shell />,
          children: [
            {
              path: 'chat',
              element: <ChatRoute />
            },
            {
              path: 'skills',
              element: <div>Skills route</div>
            }
          ]
        }
      ],
      {
        initialEntries: ['/chat']
      }
    )

    await act(async () => {
      root.render(<RouterProvider router={router} />)
    })
    await flushReact()

    expect(container.textContent).toContain('Live thread status')
    expect(container.textContent).not.toContain('Shell ready')

    await act(async () => {
      await router.navigate('/skills')
    })
    await flushReact()

    expect(container.textContent).toContain('Skills catalog')
    expect(container.textContent).not.toContain('Live thread status')
  })
})
