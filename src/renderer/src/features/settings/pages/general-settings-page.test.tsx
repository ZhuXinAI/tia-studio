// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localeOptions } from '../../../i18n/config'
import { i18n } from '../../../i18n'
import { GeneralSettingsPage } from './general-settings-page'

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('general settings page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    void i18n.changeLanguage('en-US')

    window.tiaDesktop = {
      getConfig: vi.fn(async () => ({
        baseUrl: 'http://127.0.0.1:4769',
        authToken: 'token'
      })),
      getUiConfig: vi.fn(async () => ({
        language: null
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

  it('renders a language selector with system default and supported locales', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <GeneralSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const languageSelect = container.querySelector('select[aria-label="Language"]')

    expect(container.textContent).toContain('General Settings')
    expect(languageSelect).not.toBeNull()
    expect(container.textContent).toContain('System Default')

    for (const option of localeOptions) {
      expect(container.textContent).toContain(option.label)
    }
  })

  it('switches the page copy when the selected language changes', async () => {
    const setUiConfig = vi.fn(async (config: { language?: string | null }) => config)
    window.tiaDesktop.setUiConfig = setUiConfig

    await act(async () => {
      root.render(
        <MemoryRouter>
          <GeneralSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const languageSelect = container.querySelector(
      'select[aria-label="Language"]'
    ) as HTMLSelectElement | null
    expect(languageSelect).not.toBeNull()

    await act(async () => {
      if (!languageSelect) {
        return
      }

      languageSelect.value = 'zh-CN'
      languageSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(setUiConfig).toHaveBeenCalledWith({ language: 'zh-CN' })
    expect(container.textContent).toContain('常规设置')
    expect(container.textContent).toContain('语言')
  })
})
