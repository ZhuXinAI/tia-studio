// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  listTeamWorkspacesMock: vi.fn()
}))

vi.mock('../../features/team/team-workspaces-query', () => ({
  listTeamWorkspaces: (...args: unknown[]) => mockState.listTeamWorkspacesMock(...args)
}))

import { TeamContextSwitcher } from './team-context-switcher'

function LocationDisplay(): React.JSX.Element {
  const location = useLocation()

  return <div data-testid="location-display">{location.pathname}</div>
}

describe('TeamContextSwitcher', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mockState.listTeamWorkspacesMock.mockReset()
    mockState.listTeamWorkspacesMock.mockResolvedValue([
      {
        id: 'workspace-1',
        name: 'Docs Workspace',
        rootPath: '/Users/demo/docs',
        teamDescription: '',
        supervisorProviderId: null,
        supervisorModel: '',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      },
      {
        id: 'workspace-2',
        name: 'Ops Workspace',
        rootPath: '/Users/demo/ops',
        teamDescription: '',
        supervisorProviderId: null,
        supervisorModel: '',
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
              path="/team"
              element={
                <>
                  <TeamContextSwitcher />
                  <LocationDisplay />
                </>
              }
            />
            <Route
              path="/team/:workspaceId"
              element={
                <>
                  <TeamContextSwitcher />
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

  it('renders the current workspace and switches to another workspace', async () => {
    await renderSwitcher('/team/workspace-1')

    expect(container.textContent).toContain('Docs Workspace')

    const trigger = container.querySelector(
      '[aria-label="Switch active team workspace"]'
    ) as HTMLButtonElement | null
    expect(trigger).not.toBeNull()

    act(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const workspaceButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Ops Workspace'
    )

    act(() => {
      workspaceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="location-display"]')?.textContent).toBe(
      '/team/workspace-2'
    )
  })

  it('shows an empty state when there are no team workspaces', async () => {
    mockState.listTeamWorkspacesMock.mockResolvedValue([])

    await renderSwitcher('/team')

    const trigger = container.querySelector(
      '[aria-label="Switch active team workspace"]'
    ) as HTMLButtonElement | null

    act(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('No team workspaces yet')
  })

  it('shows the create team action in the dropdown footer', async () => {
    await renderSwitcher('/team/workspace-1')

    const trigger = container.querySelector(
      '[aria-label="Switch active team workspace"]'
    ) as HTMLButtonElement | null

    act(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Create new team')
  })
})
