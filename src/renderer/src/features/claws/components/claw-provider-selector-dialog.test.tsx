// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../../i18n'
import { ClawProviderSelectorDialog } from './claw-provider-selector-dialog'
import type { ProviderRecord } from '../../settings/providers/providers-query'

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

const mockProviders: ProviderRecord[] = [
  {
    id: 'provider-1',
    name: 'OpenAI',
    type: 'openai',
    apiKey: 'sk-test',
    apiHost: null,
    selectedModel: 'gpt-4o',
    providerModels: null,
    enabled: true,
    supportsVision: true,
    isBuiltIn: false,
    icon: null,
    officialSite: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'provider-2',
    name: 'Anthropic',
    type: 'anthropic',
    apiKey: 'sk-ant-test',
    apiHost: null,
    selectedModel: 'claude-3-opus',
    providerModels: null,
    enabled: false,
    supportsVision: false,
    isBuiltIn: false,
    icon: null,
    officialSite: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  }
]

describe('ClawProviderSelectorDialog', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
    await i18n.changeLanguage('en-US')
  })

  it('renders provider list when open', async () => {
    await act(async () => {
      root.render(
        <ClawProviderSelectorDialog
          isOpen
          selectedProviderId=""
          providers={mockProviders}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={() => undefined}
          onCreateProvider={vi.fn(async () => mockProviders[0])}
          onUpdateProvider={vi.fn(async () => mockProviders[0])}
        />
      )
    })
    await flushAsyncWork()

    expect(document.body.textContent).toContain('OpenAI')
    expect(document.body.textContent).toContain('Anthropic')
  })

  it('shows selected badge on selected provider', async () => {
    await act(async () => {
      root.render(
        <ClawProviderSelectorDialog
          isOpen
          selectedProviderId="provider-1"
          providers={mockProviders}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={() => undefined}
          onCreateProvider={vi.fn(async () => mockProviders[0])}
          onUpdateProvider={vi.fn(async () => mockProviders[0])}
        />
      )
    })
    await flushAsyncWork()

    const selectedButton = document.body.querySelector(
      'button[data-provider-id="provider-1"]'
    ) as HTMLButtonElement

    expect(selectedButton.getAttribute('data-selected')).toBe('true')
    expect(selectedButton.textContent).toContain('Selected')
  })

  it('calls onApply with selected provider when apply is clicked', async () => {
    const onApply = vi.fn()

    await act(async () => {
      root.render(
        <ClawProviderSelectorDialog
          isOpen
          selectedProviderId=""
          providers={mockProviders}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={onApply}
          onCreateProvider={vi.fn(async () => mockProviders[0])}
          onUpdateProvider={vi.fn(async () => mockProviders[0])}
        />
      )
    })
    await flushAsyncWork()

    const providerButton = document.body.querySelector(
      'button[data-provider-id="provider-1"]'
    ) as HTMLButtonElement
    const applyButton = document.body.querySelector(
      'button[id="claw-provider-selector-apply"]'
    ) as HTMLButtonElement

    await act(async () => {
      providerButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    await act(async () => {
      applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onApply).toHaveBeenCalledWith('provider-1')
  })

  it('opens create dialog when add button is clicked', async () => {
    await act(async () => {
      root.render(
        <ClawProviderSelectorDialog
          isOpen
          selectedProviderId=""
          providers={mockProviders}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={() => undefined}
          onCreateProvider={vi.fn(async () => mockProviders[0])}
          onUpdateProvider={vi.fn(async () => mockProviders[0])}
        />
      )
    })
    await flushAsyncWork()

    const addButton = document.body.querySelector(
      'button[id="claw-provider-selector-add"]'
    ) as HTMLButtonElement

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(document.body.textContent).toContain('Add Provider')
  })

  it('shows empty state when no providers', async () => {
    await act(async () => {
      root.render(
        <ClawProviderSelectorDialog
          isOpen
          selectedProviderId=""
          providers={[]}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={() => undefined}
          onCreateProvider={vi.fn(async () => mockProviders[0])}
          onUpdateProvider={vi.fn(async () => mockProviders[0])}
        />
      )
    })
    await flushAsyncWork()

    expect(document.body.textContent).toContain('No configured providers yet.')
  })

  it('renders zh-CN provider selector strings and translated type labels', async () => {
    await i18n.changeLanguage('zh-CN')

    await act(async () => {
      root.render(
        <ClawProviderSelectorDialog
          isOpen
          selectedProviderId=""
          providers={mockProviders}
          isMutating={false}
          errorMessage={null}
          onClose={() => undefined}
          onApply={() => undefined}
          onCreateProvider={vi.fn(async () => mockProviders[0])}
          onUpdateProvider={vi.fn(async () => mockProviders[0])}
        />
      )
    })
    await flushAsyncWork()

    expect(document.body.textContent).toContain('选择提供商')
    expect(document.body.textContent).toContain('OpenAI 兼容 · gpt-4o')

    const addButton = document.body.querySelector(
      'button[id="claw-provider-selector-add"]'
    ) as HTMLButtonElement

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(document.body.textContent).toContain('添加提供商')
    expect(document.body.textContent).toContain('提供商名称')
    expect(document.body.textContent).toContain('类型')
  })
})
