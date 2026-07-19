// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDesktopBootstrapQueryValue,
  resetDesktopBootstrapCache
} from '../../lib/desktop-bootstrap'
import { AppV2Shell } from './app-v2-shell'

vi.mock('./app-v2-sidebar', () => ({ AppV2Sidebar: () => <aside>Sidebar</aside> }))
vi.mock('./app-v2-shell-right-rail', async (importOriginal) => {
  const original = await importOriginal<typeof import('./app-v2-shell-right-rail')>()
  return { ...original, AppV2ShellRightRail: () => <aside>Right rail</aside> }
})

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
})
