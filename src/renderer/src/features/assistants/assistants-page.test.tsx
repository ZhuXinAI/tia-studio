// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantsPage } from './pages/assistants-page'
import { deleteAssistant, listAssistants } from './assistants-query'
import { listProviders } from '../settings/providers/providers-query'
import { getMcpServersSettings } from '../settings/mcp-servers/mcp-servers-query'

vi.mock('./assistants-query', () => ({
  createAssistant: vi.fn(),
  deleteAssistant: vi.fn(),
  listAssistants: vi.fn(),
  updateAssistant: vi.fn()
}))

vi.mock('../settings/providers/providers-query', () => ({
  listProviders: vi.fn()
}))

vi.mock('../settings/mcp-servers/mcp-servers-query', () => ({
  getMcpServersSettings: vi.fn()
}))

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text)
  )

  if (!button) {
    throw new Error(`Could not find button with text: ${text}`)
  }

  return button
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('assistants page', () => {
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
        name: 'Planner',
        instructions: '',
        providerId: 'provider-1',
        workspaceConfig: { rootPath: '/Users/windht/Dev/tia-studio' },
        skillsConfig: {},
        mcpConfig: {},
        maxSteps: 100,
        memoryConfig: null,
        createdAt: '2026-03-02T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z'
      }
    ])
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
    vi.mocked(getMcpServersSettings).mockResolvedValue({
      mcpServers: {}
    })
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

  it('opens a dialog when creating an assistant', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const newAssistantButton = findButtonByText(container, 'New Assistant')
    await act(async () => {
      newAssistantButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('shows a direct entrypoint into the selected assistant chat page', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const openChatLink = Array.from(container.querySelectorAll('a')).find((candidate) =>
      candidate.textContent?.includes('Open Chat')
    )
    expect(openChatLink).not.toBeNull()
    expect(openChatLink?.getAttribute('href')).toBe('/assistants/assistant-1/threads')
  })

  it('deletes assistants from the library', async () => {
    vi.mocked(deleteAssistant).mockResolvedValue(undefined)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const deleteButton = container.querySelector(
      '[aria-label="Delete assistant Planner"]'
    ) as HTMLButtonElement | null
    expect(deleteButton).not.toBeNull()

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    expect(deleteAssistant).toHaveBeenCalledWith('assistant-1')
    expect(container.textContent).toContain('No assistants yet. Click New Assistant.')
  })

  it('keeps assistant configuration fields visible when no provider exists', async () => {
    vi.mocked(listProviders).mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const newAssistantButton = findButtonByText(container, 'New Assistant')
    await act(async () => {
      newAssistantButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('#assistant-workspace-path')).not.toBeNull()
    expect(container.textContent).toContain('Add a provider first')
  })

  it('loads providers even when assistants request fails', async () => {
    vi.mocked(listAssistants).mockRejectedValueOnce(new Error('Failed to fetch'))
    vi.mocked(listProviders)
      .mockResolvedValueOnce([
        {
          id: 'provider-2',
          name: 'Anthropic',
          type: 'anthropic',
          apiKey: 'secret',
          apiHost: 'https://api.anthropic.com/v1',
          selectedModel: 'claude-3-7-sonnet',
          providerModels: null,
          enabled: true,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'provider-2',
          name: 'Anthropic',
          type: 'anthropic',
          apiKey: 'secret',
          apiHost: 'https://api.anthropic.com/v1',
          selectedModel: 'claude-3-7-sonnet',
          providerModels: null,
          enabled: true,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        }
      ])

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    expect(container.textContent).not.toContain('Failed to fetch')

    const newAssistantButton = findButtonByText(container, 'New Assistant')
    await act(async () => {
      newAssistantButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const providerSelect = container.querySelector(
      '#assistant-provider'
    ) as HTMLSelectElement | null
    expect(providerSelect).not.toBeNull()
    const optionValues = providerSelect
      ? Array.from(providerSelect.querySelectorAll('option')).map((option) =>
          option.textContent?.trim()
        )
      : []
    expect(optionValues).toContain('Anthropic (claude-3-7-sonnet)')
  })

  it('retries loading providers when opening create dialog after initial provider load failure', async () => {
    vi.mocked(listProviders)
      .mockRejectedValueOnce(new Error('failed at first load'))
      .mockResolvedValueOnce([
        {
          id: 'provider-2',
          name: 'Anthropic',
          type: 'anthropic',
          apiKey: 'secret',
          apiHost: 'https://api.anthropic.com/v1',
          selectedModel: 'claude-3-7-sonnet',
          providerModels: null,
          enabled: true,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        }
      ])

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AssistantsPage />
        </MemoryRouter>
      )
    })
    await flushAsyncWork()

    const newAssistantButton = findButtonByText(container, 'New Assistant')
    await act(async () => {
      newAssistantButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushAsyncWork()

    const providerSelect = container.querySelector(
      '#assistant-provider'
    ) as HTMLSelectElement | null
    expect(providerSelect).not.toBeNull()
    const optionValues = providerSelect
      ? Array.from(providerSelect.querySelectorAll('option')).map((option) =>
          option.textContent?.trim()
        )
      : []
    expect(optionValues).toContain('Anthropic (claude-3-7-sonnet)')
  })
})
