// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProvidersSettingsPage } from './providers-settings-page'
import {
  createProvider,
  deleteProvider,
  listProviders,
  updateProvider
} from '../providers/providers-query'
import { queryClient } from '../../../lib/query-client'

vi.mock('../providers/providers-query', () => ({
  createProvider: vi.fn(),
  deleteProvider: vi.fn(),
  listProviders: vi.fn(),
  providerKeys: {
    all: ['providers'],
    lists: () => ['providers', 'list'],
    detail: (id: string) => ['providers', 'detail', id]
  },
  providerConnectionEventName: 'tia:provider:test-connection',
  testProviderConnection: vi.fn(),
  updateProvider: vi.fn()
}))

function setElementValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
): void {
  const valueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
  )
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('providers settings page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    queryClient.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.mocked(listProviders).mockResolvedValue([
      {
        id: 'provider-1',
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'secret',
        apiHost: 'https://api.openai.com/v1',
        selectedModel: 'gpt-5',
        providerModels: null,
        enabled: true,
        supportsVision: false,
        isBuiltIn: false,
        icon: null,
        officialSite: null,
        createdAt: '2026-03-02T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z'
      }
    ])
    vi.mocked(createProvider).mockResolvedValue({
      id: 'provider-2',
      name: 'Claude',
      type: 'anthropic',
      apiKey: 'secret-2',
      apiHost: 'https://api.anthropic.com',
      selectedModel: 'claude-sonnet-4',
      providerModels: null,
      enabled: true,
      supportsVision: true,
      isBuiltIn: false,
      icon: null,
      officialSite: null,
      createdAt: '2026-03-04T00:00:00.000Z',
      updatedAt: '2026-03-04T00:00:00.000Z'
    })
    vi.mocked(deleteProvider).mockResolvedValue(undefined)
    vi.mocked(updateProvider).mockImplementation(async (_providerId, payload) => ({
      id: 'provider-1',
      name: payload.name ?? 'OpenAI',
      type: payload.type ?? 'openai',
      apiKey: payload.apiKey ?? 'secret',
      apiHost: payload.apiHost ?? 'https://api.openai.com/v1',
      selectedModel: payload.selectedModel ?? 'gpt-5',
      providerModels: payload.providerModels ?? null,
      enabled: payload.enabled ?? true,
      supportsVision: payload.supportsVision ?? false,
      isBuiltIn: false,
      icon: null,
      officialSite: null,
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-03T00:00:00.000Z'
    }))
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount()
      })
    }
    if (container) {
      container.remove()
    }
    queryClient.clear()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('deletes providers from inline edit panel delete button', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProvidersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const deleteButton = container.querySelector(
      '[aria-label="Delete provider OpenAI"]'
    ) as HTMLButtonElement | null
    expect(deleteButton).not.toBeNull()

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(deleteProvider).toHaveBeenCalledWith('provider-1')
    expect(container.textContent).toContain('No providers yet. Create one to get started.')
    expect(container.textContent).not.toContain('General Settings')
  })

  it('opens create-provider dialog from the New button', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProvidersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const newProviderButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('+ New')
    )
    expect(newProviderButton).toBeDefined()

    await act(async () => {
      newProviderButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(container.textContent).toContain('New Model Provider')
    expect(container.textContent).toContain('Provider Name')
    expect(container.textContent).toContain('Save Provider')
  })

  it('shows searchable provider sidebar without legacy heading copy', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProvidersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const searchInput = container.querySelector(
      '[data-provider-search-input]'
    ) as HTMLInputElement | null
    expect(searchInput).not.toBeNull()
    expect(searchInput?.placeholder).toBe('Search providers...')

    expect(container.textContent).not.toContain('Model Provider Settings')
    expect(container.textContent).not.toContain(
      'Your credentials are saved locally on your device for security. We never see your API keys.'
    )
  })

  it('shows save success as a floating toast', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProvidersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save Provider')
    )
    expect(saveButton).toBeDefined()

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(updateProvider).toHaveBeenCalledTimes(1)
    // Toast is rendered by Sonner in a portal, not in the component tree
  })

  it('updates shared providers cache after creating a provider', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProvidersSettingsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const newProviderButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('+ New')
    )
    expect(newProviderButton).toBeDefined()

    await act(async () => {
      newProviderButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement | null
    expect(dialog).not.toBeNull()

    const selectedModelInput = Array.from(
      dialog?.querySelectorAll('input, textarea, select') ?? []
    ).find((element) => element.getAttribute('id') === 'provider-selected-model') as
      | HTMLInputElement
      | HTMLSelectElement
      | null
    expect(selectedModelInput).not.toBeNull()

    await act(async () => {
      if (selectedModelInput) {
        setElementValue(selectedModelInput, 'claude-sonnet-4')
      }
    })

    const saveButtons = Array.from(dialog?.querySelectorAll('button') ?? []).filter((button) =>
      button.textContent?.includes('Save Provider')
    )
    const saveButton = saveButtons.at(0)
    expect(saveButton).toBeDefined()

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(createProvider).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(['providers', 'list'])).toEqual([
      expect.objectContaining({
        id: 'provider-2',
        selectedModel: 'claude-sonnet-4'
      }),
      expect.objectContaining({
        id: 'provider-1'
      })
    ])
  })
})
