// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SecuritySettingsPage } from './security-settings-page'
import { getSecuritySettings, updateSecuritySettings } from '../security/security-settings-query'

vi.mock('../security/security-settings-query', () => ({
  getSecuritySettings: vi.fn(),
  updateSecuritySettings: vi.fn()
}))

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('security settings page', () => {
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

    vi.mocked(getSecuritySettings).mockResolvedValue({
      promptInjectionEnabled: true,
      piiDetectionEnabled: true,
      guardrailProviderId: null,
      availableProviders: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          type: 'openai',
          selectedModel: 'gpt-5'
        }
      ]
    })
    vi.mocked(updateSecuritySettings).mockResolvedValue({
      promptInjectionEnabled: false,
      piiDetectionEnabled: true,
      guardrailProviderId: 'provider-1',
      availableProviders: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          type: 'openai',
          selectedModel: 'gpt-5'
        }
      ]
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

  it('toggles the prompt injection detector', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SecuritySettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const switches = Array.from(container.querySelectorAll('[role="switch"]'))
    const promptInjectionSwitch = switches[0] as HTMLButtonElement | undefined

    expect(promptInjectionSwitch).toBeDefined()
    expect(promptInjectionSwitch?.getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      promptInjectionSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateSecuritySettings).toHaveBeenCalledWith({ promptInjectionEnabled: false })
  })

  it('updates the guardrail provider override', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SecuritySettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const select = container.querySelector(
      '#security-guardrail-provider'
    ) as HTMLSelectElement | null

    expect(select).not.toBeNull()

    await act(async () => {
      if (select) {
        select.value = 'provider-1'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await flushAsyncWork()

    expect(updateSecuritySettings).toHaveBeenCalledWith({ guardrailProviderId: 'provider-1' })
  })
})
