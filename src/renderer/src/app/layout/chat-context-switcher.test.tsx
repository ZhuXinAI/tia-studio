// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  listAssistantsMock: vi.fn()
}))

vi.mock('../../features/assistants/assistants-query', () => ({
  listAssistants: (...args: unknown[]) => mockState.listAssistantsMock(...args)
}))

import { ChatContextSwitcher } from './chat-context-switcher'

function LocationDisplay(): React.JSX.Element {
  const location = useLocation()

  return <div data-testid="location-display">{location.pathname}</div>
}

describe('ChatContextSwitcher', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mockState.listAssistantsMock.mockReset()
    mockState.listAssistantsMock.mockResolvedValue([
      {
        id: 'assistant-1',
        name: 'Planner',
        description: '',
        instructions: '',
        enabled: true,
        providerId: 'provider-1',
        workspaceConfig: {},
        skillsConfig: {},
        mcpConfig: {},
        maxSteps: 100,
        memoryConfig: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      },
      {
        id: 'assistant-2',
        name: 'Reviewer',
        description: '',
        instructions: '',
        enabled: true,
        providerId: 'provider-1',
        workspaceConfig: {},
        skillsConfig: {},
        mcpConfig: {},
        maxSteps: 100,
        memoryConfig: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      }
    ])

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  async function renderSwitcher(initialEntry: string): Promise<void> {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              path="/chat/:assistantId"
              element={
                <>
                  <ChatContextSwitcher />
                  <LocationDisplay />
                </>
              }
            />
            <Route
              path="/claws"
              element={
                <>
                  <div>Claws</div>
                  <LocationDisplay />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      )
    })

    await act(async () => {
      await Promise.resolve()
    })
  }

  it('renders the current assistant and switches to another assistant from the dropdown', async () => {
    await renderSwitcher('/chat/assistant-1')

    expect(container.textContent).toContain('Planner')

    const trigger = container.querySelector(
      '[aria-label="Switch active assistant"]'
    ) as HTMLButtonElement | null
    expect(trigger).not.toBeNull()

    act(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const reviewerButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Reviewer'
    )

    act(() => {
      reviewerButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="location-display"]')?.textContent).toBe(
      '/chat/assistant-2'
    )
  })

  it('opens assistant management from the dropdown footer action', async () => {
    await renderSwitcher('/chat/assistant-1')

    const trigger = container.querySelector(
      '[aria-label="Switch active assistant"]'
    ) as HTMLButtonElement | null

    act(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const manageButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Manage assistants & channels')
    )

    act(() => {
      manageButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="location-display"]')?.textContent).toBe('/claws')
  })

  it('opens the create assistant flow from the dropdown action', async () => {
    await renderSwitcher('/chat/assistant-1')

    const trigger = container.querySelector(
      '[aria-label="Switch active assistant"]'
    ) as HTMLButtonElement | null

    act(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const createButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create new assistant')
    )

    act(() => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="location-display"]')?.textContent).toBe('/claws')
  })
})
