// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listAssistants } from '../../assistants/assistants-query'
import { ChannelsSettingsPage } from './channels-settings-page'
import { getChannelsSettings, updateChannelsSettings } from '../channels/channels-query'

vi.mock('../../assistants/assistants-query', () => ({
  listAssistants: vi.fn()
}))

vi.mock('../channels/channels-query', () => ({
  getChannelsSettings: vi.fn(),
  updateChannelsSettings: vi.fn()
}))

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function setElementValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string
): void {
  const prototype =
    element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  setter?.call(element, value)
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
  )
}

describe('channels settings page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.mocked(listAssistants).mockResolvedValue([
      {
        id: 'assistant-1',
        name: 'Support Assistant',
        description: '',
        instructions: '',
        providerId: 'provider-1',
        workspaceConfig: {},
        skillsConfig: {},
        mcpConfig: {},
        maxSteps: 100,
        memoryConfig: null,
        createdAt: '2026-03-08T00:00:00.000Z',
        updatedAt: '2026-03-08T00:00:00.000Z'
      }
    ])
    vi.mocked(getChannelsSettings).mockResolvedValue({
      lark: {
        id: 'channel-1',
        enabled: true,
        name: 'Lark',
        assistantId: 'assistant-1',
        appId: 'cli_xxx',
        appSecret: 'secret',
        status: 'connected',
        errorMessage: null
      }
    })
    vi.mocked(updateChannelsSettings).mockResolvedValue({
      lark: {
        id: 'channel-1',
        enabled: true,
        name: 'Ops Lark',
        assistantId: 'assistant-1',
        appId: 'cli_yyy',
        appSecret: 'secret-2',
        status: 'connected',
        errorMessage: null
      }
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

  it('renders lark settings fields and assistant selector', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ChannelsSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('Channels')
    expect(container.textContent).toContain('App ID')
    expect(container.textContent).toContain('App Secret')
    expect(container.textContent).toContain('Assistant')
    expect(container.querySelector('input[id="lark-app-id"]')).not.toBeNull()
    expect(container.querySelector('input[id="lark-app-secret"]')).not.toBeNull()
    expect(container.querySelector('select[id="lark-assistant"]')).not.toBeNull()
    expect(container.querySelector('a[href*="lark"]')).not.toBeNull()
  })

  it('saves updated lark settings', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ChannelsSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const nameInput = container.querySelector('input[id="lark-name"]') as HTMLInputElement | null
    const appIdInput = container.querySelector('input[id="lark-app-id"]') as HTMLInputElement | null
    const appSecretInput = container.querySelector(
      'input[id="lark-app-secret"]'
    ) as HTMLInputElement | null
    const assistantSelect = container.querySelector(
      'select[id="lark-assistant"]'
    ) as HTMLSelectElement | null
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save')
    )

    expect(nameInput).not.toBeNull()
    expect(appIdInput).not.toBeNull()
    expect(appSecretInput).not.toBeNull()
    expect(assistantSelect).not.toBeNull()
    expect(saveButton).toBeDefined()

    await act(async () => {
      if (nameInput) {
        setElementValue(nameInput, 'Ops Lark')
      }
      if (appIdInput) {
        setElementValue(appIdInput, 'cli_yyy')
      }
      if (appSecretInput) {
        setElementValue(appSecretInput, 'secret-2')
      }
      if (assistantSelect) {
        setElementValue(assistantSelect, 'assistant-1')
      }
    })

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateChannelsSettings).toHaveBeenCalledWith({
      lark: {
        enabled: true,
        name: 'Ops Lark',
        assistantId: 'assistant-1',
        appId: 'cli_yyy',
        appSecret: 'secret-2'
      }
    })
  })
})
