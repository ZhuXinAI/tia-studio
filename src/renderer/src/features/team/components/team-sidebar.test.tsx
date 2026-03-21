// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamSidebar } from './team-sidebar'

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data = [],
    itemContent,
    className
  }: {
    data?: Array<unknown>
    itemContent?: (index: number, item: unknown) => React.ReactNode
    className?: string
  }) => (
    <div data-testid="team-sidebar-viewport" data-class-name={className}>
      {data.map((item, index) => (
        <div key={index}>{itemContent ? itemContent(index, item) : null}</div>
      ))}
    </div>
  )
}))

let container: HTMLDivElement
let root: Root

function renderSidebar(input?: {
  selectedWorkspace?: {
    id: string
    name: string
    rootPath: string
    teamDescription: string
    supervisorProviderId: string | null
    supervisorModel: string
    createdAt: string
    updatedAt: string
  } | null
  threads?: Array<{
    id: string
    workspaceId: string
    resourceId: string
    title: string
    teamDescription: string
    supervisorProviderId: string | null
    supervisorModel: string
    lastMessageAt: string | null
    createdAt: string
    updatedAt: string
  }>
  isLoadingData?: boolean
  isLoadingThreads?: boolean
  onCreateThread?: () => void
  onSelectThread?: (threadId: string) => void
  onDeleteThread?: (thread: { id: string }) => void
}): void {
  act(() => {
    root.render(
      <TeamSidebar
        selectedWorkspace={input?.selectedWorkspace ?? null}
        threads={input?.threads ?? []}
        selectedThreadId={null}
        isLoadingData={input?.isLoadingData ?? false}
        isLoadingThreads={input?.isLoadingThreads ?? false}
        isCreatingThread={false}
        deletingThreadId={null}
        onCreateThread={input?.onCreateThread ?? (() => undefined)}
        onSelectThread={input?.onSelectThread ?? (() => undefined)}
        onDeleteThread={input?.onDeleteThread ?? (() => undefined)}
      />
    )
  })
}

describe('TeamSidebar', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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

  it('shows a loading placeholder while the current team is being resolved', () => {
    renderSidebar({
      selectedWorkspace: null,
      isLoadingData: true
    })

    expect(container.textContent).toContain('Team Threads')
    expect(container.textContent).toContain('Loading team workspaces...')
  })

  it('creates a new thread from the active team view', () => {
    const onCreateThread = vi.fn()

    renderSidebar({
      selectedWorkspace: {
        id: 'workspace-1',
        name: 'Docs Workspace',
        rootPath: '/Users/demo/project',
        teamDescription: '',
        supervisorProviderId: null,
        supervisorModel: '',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      },
      onCreateThread
    })

    const createThreadButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('New Thread')
    )
    expect(createThreadButton).not.toBeUndefined()

    act(() => {
      createThreadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onCreateThread).toHaveBeenCalledTimes(1)
  })

  it('shows the selected team and filters its threads by search text', async () => {
    const releaseThreadTitle = 'Release Team'
    const researchThreadTitle = 'Research sprint'

    renderSidebar({
      selectedWorkspace: {
        id: 'workspace-1',
        name: 'Docs Workspace',
        rootPath: '/Users/demo/project',
        teamDescription: '',
        supervisorProviderId: null,
        supervisorModel: '',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      },
      threads: [
        {
          id: 'thread-1',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: researchThreadTitle,
          teamDescription: '',
          supervisorProviderId: null,
          supervisorModel: '',
          lastMessageAt: '2026-03-03T15:24:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        },
        {
          id: 'thread-2',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: releaseThreadTitle,
          teamDescription: '',
          supervisorProviderId: null,
          supervisorModel: '',
          lastMessageAt: '2026-03-04T15:24:00.000Z',
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        }
      ]
    })

    expect(container.textContent).toContain('Docs Workspace')
    expect(container.textContent).toContain('/Users/demo/project')

    const searchInput = container.querySelector(
      'input[aria-label="Search team threads"]'
    ) as HTMLInputElement | null
    expect(searchInput).not.toBeNull()

    act(() => {
      if (!searchInput) {
        return
      }

      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      valueSetter?.call(searchInput, 'release')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain(releaseThreadTitle)
    expect(container.textContent).not.toContain(researchThreadTitle)
  })

  it('selects a thread from the current team thread list', () => {
    const onSelectThread = vi.fn()

    renderSidebar({
      selectedWorkspace: {
        id: 'workspace-1',
        name: 'Docs Workspace',
        rootPath: '/Users/demo/project',
        teamDescription: '',
        supervisorProviderId: null,
        supervisorModel: '',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      },
      threads: [
        {
          id: 'thread-1',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: 'Release Team',
          teamDescription: '',
          supervisorProviderId: null,
          supervisorModel: '',
          lastMessageAt: null,
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }
      ],
      onSelectThread
    })

    const threadButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Release Team')
    )
    expect(threadButton).not.toBeUndefined()

    act(() => {
      threadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectThread).toHaveBeenCalledWith('thread-1')
  })

  it('does not delete a team thread until confirmed', () => {
    const onDeleteThread = vi.fn()

    renderSidebar({
      selectedWorkspace: {
        id: 'workspace-1',
        name: 'Docs Workspace',
        rootPath: '/Users/demo/project',
        teamDescription: '',
        supervisorProviderId: null,
        supervisorModel: '',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      },
      threads: [
        {
          id: 'thread-1',
          workspaceId: 'workspace-1',
          resourceId: 'default-profile',
          title: 'Release Team',
          teamDescription: '',
          supervisorProviderId: null,
          supervisorModel: '',
          lastMessageAt: null,
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T00:00:00.000Z'
        }
      ],
      onDeleteThread
    })

    const deleteButton = container.querySelector(
      '[aria-label="Delete team thread Release Team"]'
    ) as HTMLButtonElement | null
    expect(deleteButton).not.toBeNull()

    act(() => {
      deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onDeleteThread).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Delete thread?')

    const confirmButton = container.querySelector(
      '[aria-label="Confirm delete team thread Release Team"]'
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    act(() => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onDeleteThread).toHaveBeenCalledTimes(1)
    expect(onDeleteThread).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'thread-1'
      })
    )
  })
})
