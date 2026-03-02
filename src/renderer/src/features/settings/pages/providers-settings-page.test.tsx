// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProvidersSettingsPage } from './providers-settings-page'
import { deleteProvider, listProviders } from '../providers/providers-query'

vi.mock('../providers/providers-query', () => ({
  createProvider: vi.fn(),
  deleteProvider: vi.fn(),
  listProviders: vi.fn(),
  providerConnectionEventName: 'tia:provider:test-connection',
  testProviderConnection: vi.fn(),
  updateProvider: vi.fn()
}))

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
        createdAt: '2026-03-02T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z'
      }
    ])
    vi.mocked(deleteProvider).mockResolvedValue(undefined)
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
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('deletes providers from the list', async () => {
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
  })
})
