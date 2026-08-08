// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDesktopBootstrapQueryValue,
  resetDesktopBootstrapCache
} from '../../lib/desktop-bootstrap'
import { AppV2Shell } from './app-v2-shell'
import { useAppV2ShellRightRail } from './app-v2-shell-right-rail'
import { useAppV2ShellBottomDrawer } from './app-v2-shell-bottom-drawer'

vi.mock('./app-v2-sidebar', () => ({
  AppV2Sidebar: ({
    isCollapsed,
    onToggleCollapsed
  }: {
    isCollapsed: boolean
    onToggleCollapsed: () => void
  }) => (
    <aside data-testid="sidebar-mock" data-collapsed={isCollapsed}>
      <button type="button" data-testid="sidebar-toggle" onClick={onToggleCollapsed}>
        Sidebar
      </button>
    </aside>
  )
}))
vi.mock('./app-v2-shell-right-rail', async (importOriginal) => {
  const original = await importOriginal<typeof import('./app-v2-shell-right-rail')>()
  return { ...original, AppV2ShellRightRail: () => <aside>Right rail</aside> }
})

function RegisterShellDrawers(): React.JSX.Element {
  const rightRail = useAppV2ShellRightRail()
  const bottomDrawer = useAppV2ShellBottomDrawer()

  useEffect(() => {
    rightRail.setHasContent(true)
    bottomDrawer.setHasContent(true)
    return () => {
      rightRail.setHasContent(false)
      bottomDrawer.setHasContent(false)
    }
  }, [bottomDrawer, rightRail])

  return <div />
}

describe('AppV2Shell window chrome', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    resetDesktopBootstrapCache()
    window.sessionStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    window.history.replaceState({}, '', '/')
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  it('does not render the custom title strip inside a framed Windows window', async () => {
    const query = createDesktopBootstrapQueryValue({
      apiBaseUrl: 'http://127.0.0.1:4769',
      authMode: 'bearer',
      authToken: 'test-token',
      app: { name: 'TIA Studio', version: '0.3.4', platform: 'win32' },
      capabilities: {
        autoUpdate: true,
        managedRuntimes: true,
        nativeDirectoryPicker: true,
        runtimeOnboarding: true
      }
    })
    window.history.replaceState({}, '', `/?desktopBootstrap=${query}`)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route element={<AppV2Shell />}>
              <Route path="/settings" element={<div>Settings</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      )
    })

    expect(container.querySelector('.drag-region')).toBeNull()
    expect(container.querySelector('main')?.className).not.toContain('pt-8')
  })

  it('exposes thread title actions for the terminal and tools drawers', async () => {
    const query = createDesktopBootstrapQueryValue({
      apiBaseUrl: 'http://127.0.0.1:4769',
      authMode: 'none',
      app: { name: 'TIA Studio', version: '0.3.4', platform: 'darwin' },
      capabilities: {
        autoUpdate: false,
        managedRuntimes: false,
        nativeDirectoryPicker: false,
        runtimeOnboarding: false
      }
    })
    window.history.replaceState({}, '', `/?desktopBootstrap=${query}`)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/chat/thread-1']}>
          <Routes>
            <Route element={<AppV2Shell />}>
              <Route
                path="/chat/:threadId"
                element={
                  <>
                    <RegisterShellDrawers />
                    <div>Thread</div>
                  </>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>
      )
    })

    const terminalButton = container.querySelector('button[aria-label="Toggle tool drawer"]')
    const toolsButton = container.querySelector('button[aria-label="Toggle tools panel"]')
    const threadContainer = container.querySelector('[data-testid="app-v2-thread-container"]')
    expect(container.querySelector('a[aria-label="New chat"]')).toBeNull()
    expect(terminalButton).not.toBeNull()
    expect(toolsButton).not.toBeNull()
    expect(threadContainer?.contains(terminalButton)).toBe(true)
    expect(threadContainer?.contains(toolsButton)).toBe(true)
    expect(terminalButton?.getAttribute('aria-pressed')).toBe('false')
    expect(toolsButton?.getAttribute('aria-pressed')).toBe('false')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="sidebar-toggle"]')?.click()
    })
    expect(container.querySelector('a[aria-label="New chat"]')).not.toBeNull()

    await act(async () => {
      terminalButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(terminalButton?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-testid="app-v2-bottom-drawer"]')).not.toBeNull()

    await act(async () => {
      toolsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(toolsButton?.getAttribute('aria-pressed')).toBe('true')
    expect(container.textContent).toContain('Right rail')
  })

  it('starts Windows thread content below the native menu row', async () => {
    const query = createDesktopBootstrapQueryValue({
      apiBaseUrl: 'http://127.0.0.1:4769',
      authMode: 'none',
      app: { name: 'TIA Studio', version: '0.3.4', platform: 'win32' },
      capabilities: {
        autoUpdate: false,
        managedRuntimes: false,
        nativeDirectoryPicker: false,
        runtimeOnboarding: false
      }
    })
    window.history.replaceState({}, '', `/?desktopBootstrap=${query}`)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/chat/thread-1']}>
          <Routes>
            <Route element={<AppV2Shell />}>
              <Route path="/chat/:threadId" element={<div>Thread</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      )
    })

    expect(container.querySelector('.drag-region')).toBeNull()
    expect(container.querySelector('main')?.className).toContain('pt-8')
  })
})
