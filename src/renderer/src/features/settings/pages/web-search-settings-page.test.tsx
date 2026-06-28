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
    ...overrides
  }
}

describe('web search settings page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

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

  it('renders browsing settings without built-in browser controls', async () => {
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
    expect(container.textContent).toContain('Use external browser tools for interactive browsing.')
    expect(container.textContent).not.toContain('Default Search Engine')
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
    const keepFetchWindowOpenSwitch = switches[0] as HTMLButtonElement | undefined

    expect(keepFetchWindowOpenSwitch?.getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      keepFetchWindowOpenSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateWebSearchSettings).toHaveBeenCalledWith({ keepBrowserWindowOpen: false })
  })

  it('toggles showBrowser in the fetch window section', async () => {
    vi.mocked(updateWebSearchSettings).mockResolvedValue(
      createSettings({
        showBrowser: true
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
    const showBrowserSwitch = switches[1] as HTMLButtonElement | undefined

    expect(showBrowserSwitch?.getAttribute('aria-checked')).toBe('false')

    await act(async () => {
      showBrowserSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateWebSearchSettings).toHaveBeenCalledWith({ showBrowser: true })
  })
})
