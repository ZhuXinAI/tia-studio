import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClawProviderSelectorDialog } from './claw-provider-selector-dialog'
import type { ProviderRecord } from '../../settings/providers/providers-query'

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
  it('renders provider list when open', () => {
    render(
      <ClawProviderSelectorDialog
        isOpen={true}
        selectedProviderId=""
        providers={mockProviders}
        isMutating={false}
        errorMessage={null}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onCreateProvider={vi.fn()}
        onUpdateProvider={vi.fn()}
      />
    )

    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
  })

  it('shows selected badge on selected provider', () => {
    render(
      <ClawProviderSelectorDialog
        isOpen={true}
        selectedProviderId="provider-1"
        providers={mockProviders}
        isMutating={false}
        errorMessage={null}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onCreateProvider={vi.fn()}
        onUpdateProvider={vi.fn()}
      />
    )

    const selectedButton = screen.getByRole('button', { name: /OpenAI/i })
    expect(selectedButton).toHaveAttribute('data-selected', 'true')
  })

  it('calls onApply with selected provider when apply is clicked', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(
      <ClawProviderSelectorDialog
        isOpen={true}
        selectedProviderId=""
        providers={mockProviders}
        isMutating={false}
        errorMessage={null}
        onClose={vi.fn()}
        onApply={onApply}
        onCreateProvider={vi.fn()}
        onUpdateProvider={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /OpenAI/i }))
    await user.click(screen.getByRole('button', { name: /Apply/i }))

    expect(onApply).toHaveBeenCalledWith('provider-1')
  })

  it('opens create dialog when add button is clicked', async () => {
    const user = userEvent.setup()

    render(
      <ClawProviderSelectorDialog
        isOpen={true}
        selectedProviderId=""
        providers={mockProviders}
        isMutating={false}
        errorMessage={null}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onCreateProvider={vi.fn()}
        onUpdateProvider={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Add Provider/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Add Provider/i })).toBeInTheDocument()
    })
  })

  it('shows empty state when no providers', () => {
    render(
      <ClawProviderSelectorDialog
        isOpen={true}
        selectedProviderId=""
        providers={[]}
        isMutating={false}
        errorMessage={null}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onCreateProvider={vi.fn()}
        onUpdateProvider={vi.fn()}
      />
    )

    expect(screen.getByText(/No configured providers yet/i)).toBeInTheDocument()
  })
})
