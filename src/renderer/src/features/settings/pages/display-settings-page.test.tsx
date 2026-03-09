// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../../i18n'
import { ThemeProvider } from '../../../components/theme-provider'
import { DisplaySettingsPage } from './display-settings-page'

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('display settings page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    window.localStorage.clear()
    void i18n.changeLanguage('en-US')
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })

    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'token'
      })),
      getUiConfig: vi.fn(async () => ({
        transparent: false
      })),
      setUiConfig: vi.fn(async (config) => config),
      getSystemLocale: vi.fn(async () => 'en-US'),
      pickDirectory: vi.fn(async () => null)
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

  it('renders display strings from the translation catalog and reacts to language changes', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ThemeProvider>
            <DisplaySettingsPage />
          </ThemeProvider>
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Display Settings')
    expect(container.textContent).toContain('Theme')
    expect(container.textContent).toContain('Transparent Window')

    await act(async () => {
      await i18n.changeLanguage('zh-CN')
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('显示设置')
    expect(container.textContent).toContain('主题')
    expect(container.textContent).toContain('透明窗口')
  })
})
