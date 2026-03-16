// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSearchSettingsPage } from './web-search-settings-page'
import {
  getWebSearchSettings,
  updateWebSearchSettings,
  type WebSearchSettings
} from '../web-search/web-search-query'

vi.mock('../web-search/web-search-query', () => ({
  getWebSearchSettings: vi.fn(),
  updateWebSearchSettings: vi.fn()
}))

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function createSettings(overrides?: Partial<WebSearchSettings>): WebSearchSettings {
  return {
    keepBrowserWindowOpen: true,
    showBrowser: false,
    showBuiltInBrowser: false,
    showTiaBrowserTool: false,
    browserAutomationMode: 'built-in-browser',
    ...overrides
  }
}

function findButtonByText(container: HTMLDivElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text)
  ) as HTMLButtonElement | undefined
}

describe('web search settings page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:3456',
        authToken: 'token'
      })),
      pickDirectory: vi.fn(async () => null)
    }

    vi.mocked(getWebSearchSettings).mockResolvedValue(createSettings())
    vi.mocked(updateWebSearchSettings).mockResolvedValue(createSettings())
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('renders browsing settings with built-in browser controls by default', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WebSearchSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Browsing')
    expect(container.textContent).toContain('Browser Automation')
    expect(container.textContent).toContain('Show Built-in Browser Window')
    expect(container.textContent).not.toContain('Default Search Engine')
    expect(container.textContent).not.toContain('Show TIA Browser Tool Window')
  })

  it('toggles keepBrowserWindowOpen in the fetch window section', async () => {
    vi.mocked(updateWebSearchSettings).mockResolvedValue(
      createSettings({
        keepBrowserWindowOpen: false
      })
    )

    await act(async () => {
      root.render(
        <MemoryRouter>
          <WebSearchSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const switches = Array.from(container.querySelectorAll('[role="switch"]'))
    const keepFetchWindowOpenSwitch = switches[1] as HTMLButtonElement | undefined

    expect(keepFetchWindowOpenSwitch?.getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      keepFetchWindowOpenSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateWebSearchSettings).toHaveBeenCalledWith({ keepBrowserWindowOpen: false })
  })

  it('toggles the built-in browser visibility setting', async () => {
    vi.mocked(updateWebSearchSettings).mockResolvedValue(
      createSettings({
        showBuiltInBrowser: true
      })
    )

    await act(async () => {
      root.render(
        <MemoryRouter>
          <WebSearchSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const switches = Array.from(container.querySelectorAll('[role="switch"]'))
    const builtInBrowserSwitch = switches[0] as HTMLButtonElement | undefined

    expect(builtInBrowserSwitch?.getAttribute('aria-checked')).toBe('false')

    await act(async () => {
      builtInBrowserSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateWebSearchSettings).toHaveBeenCalledWith({ showBuiltInBrowser: true })
  })

  it('switches browser automation mode to the tia browser tool', async () => {
    vi.mocked(updateWebSearchSettings).mockResolvedValue(
      createSettings({
        browserAutomationMode: 'tia-browser-tool'
      })
    )

    await act(async () => {
      root.render(
        <MemoryRouter>
          <WebSearchSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const tiaBrowserToolButton = findButtonByText(container, 'TIA Browser Tool')

    await act(async () => {
      tiaBrowserToolButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateWebSearchSettings).toHaveBeenCalledWith({
      browserAutomationMode: 'tia-browser-tool'
    })
  })

  it('shows the tia browser tool visibility toggle after switching modes', async () => {
    vi.mocked(updateWebSearchSettings)
      .mockResolvedValueOnce(
        createSettings({
          browserAutomationMode: 'tia-browser-tool'
        })
      )
      .mockResolvedValueOnce(
        createSettings({
          browserAutomationMode: 'tia-browser-tool',
          showTiaBrowserTool: true
        })
      )

    await act(async () => {
      root.render(
        <MemoryRouter>
          <WebSearchSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    await act(async () => {
      findButtonByText(container, 'TIA Browser Tool')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Show TIA Browser Tool Window')

    const switches = Array.from(container.querySelectorAll('[role="switch"]'))
    const tiaBrowserToolSwitch = switches[0] as HTMLButtonElement | undefined

    await act(async () => {
      tiaBrowserToolSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateWebSearchSettings).toHaveBeenLastCalledWith({ showTiaBrowserTool: true })
  })
})
