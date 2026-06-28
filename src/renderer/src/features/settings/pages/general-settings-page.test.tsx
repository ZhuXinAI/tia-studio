// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localeOptions } from '../../../i18n/config'
import { i18n } from '../../../i18n'
import { GeneralSettingsPage } from './general-settings-page'
import { getSystemLocale, getUiConfig, setUiConfig } from '../ui-config'

vi.mock('../ui-config', () => ({
  getUiConfig: vi.fn(),
  setUiConfig: vi.fn(),
  getSystemLocale: vi.fn()
}))

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
    vi.mocked(getUiConfig).mockResolvedValue({
      language: null
    })
    vi.mocked(setUiConfig).mockImplementation(async (config) => config)
    vi.mocked(getSystemLocale).mockResolvedValue('en-US')
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
    const setUiConfigSpy = vi.fn(async (config: { language?: string | null }) => config)
    vi.mocked(setUiConfig).mockImplementation(setUiConfigSpy)

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

    expect(setUiConfigSpy).toHaveBeenCalledWith({ language: 'zh-CN' })
    expect(container.textContent).toContain('常规设置')
    expect(container.textContent).toContain('语言')
  })
})
