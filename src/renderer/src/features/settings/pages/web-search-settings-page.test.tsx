// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSearchSettingsPage } from './web-search-settings-page'
import { getWebSearchSettings, updateWebSearchSettings } from '../web-search/web-search-query'

vi.mock('../web-search/web-search-query', () => ({
  getWebSearchSettings: vi.fn(),
  updateWebSearchSettings: vi.fn()
}))

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
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
      pickDirectory: vi.fn(async () => null),
      openWebSearchSettings: vi.fn(async () => true)
    }

    vi.mocked(getWebSearchSettings).mockResolvedValue({
      defaultEngine: 'bing',
      keepBrowserWindowOpen: true,
      availableEngines: ['google', 'bing', 'baidu']
    })
    vi.mocked(updateWebSearchSettings).mockResolvedValue({
      defaultEngine: 'google',
      keepBrowserWindowOpen: true,
      availableEngines: ['google', 'bing', 'baidu']
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

  it('updates default engine from bing to google', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WebSearchSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const buttons = Array.from(container.querySelectorAll('button'))
    const setGoogleButton = buttons.find((button) => button.textContent?.includes('Set Default'))

    expect(setGoogleButton).toBeDefined()

    await act(async () => {
      setGoogleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateWebSearchSettings).toHaveBeenCalledWith({ defaultEngine: 'google' })
    expect(container.textContent).toContain('Google is now the default web search engine.')
  })

  it('toggles keepBrowserWindowOpen in background mode', async () => {
    vi.mocked(updateWebSearchSettings).mockResolvedValue({
      defaultEngine: 'bing',
      keepBrowserWindowOpen: false,
      availableEngines: ['google', 'bing', 'baidu']
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <WebSearchSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const buttons = Array.from(container.querySelectorAll('button'))
    const disableBackgroundButton = buttons.find((button) =>
      button.textContent?.includes('Disable')
    )

    expect(disableBackgroundButton).toBeDefined()

    await act(async () => {
      disableBackgroundButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateWebSearchSettings).toHaveBeenCalledWith({ keepBrowserWindowOpen: false })
    expect(container.textContent).toContain('Background browser window is now disabled.')
  })

  it('opens search engine settings in desktop BrowserWindow context', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WebSearchSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const buttons = Array.from(container.querySelectorAll('button'))
    const bingSettingsButton = buttons.find((button) =>
      button.textContent?.includes('Open Bing Settings')
    )

    expect(bingSettingsButton).toBeDefined()

    await act(async () => {
      bingSettingsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(window.tiaDesktop.openWebSearchSettings).toHaveBeenCalledWith(
      'https://www.bing.com/account/general'
    )
  })
})
