// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadSidebar } from './thread-sidebar'

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
    <div data-testid="thread-sidebar-viewport" data-class-name={className}>
      {data.map((item, index) => (
        <div key={index}>{itemContent ? itemContent(index, item) : null}</div>
      ))}
    </div>
  )
}))

type TestThread = {
  id: string
  assistantId: string
  resourceId: string
  title: string
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

describe('thread sidebar assistant management', () => {
  let container: HTMLDivElement
  let root: Root

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

  function renderSidebar(callbacks?: {
    onCreateAssistant?: () => void
    onBrowseAssistants?: () => void
    onSelectAssistant?: (assistantId: string) => void
    onEditAssistant?: (assistantId: string) => void
    onDeleteAssistant?: (assistantId: string) => void
    canDeleteAssistant?: boolean
    isDetailView?: boolean
    threads?: TestThread[]
    assistantName?: string
    extraBranches?: Array<{
      assistantId: string
      assistantName: string
      canDeleteAssistant: boolean
      isSelected: boolean
      threads: TestThread[]
    }>
  }): void {
    const assistantName = callbacks?.assistantName ?? 'Planner'
    const isDetailView = callbacks?.isDetailView ?? false

    act(() => {
      root.render(
        <MemoryRouter>
          <ThreadSidebar
            branches={[
              {
                assistantId: 'assistant-1',
                assistantName,
                canDeleteAssistant: callbacks?.canDeleteAssistant ?? true,
                isSelected: isDetailView,
                threads: callbacks?.threads ?? []
              },
              ...(callbacks?.extraBranches ?? [])
            ]}
            selectedThreadId={null}
            deletingThreadId={null}
            deletingAssistantId={null}
            isLoadingData={false}
            assistantsCount={1 + (callbacks?.extraBranches?.length ?? 0)}
            isLoadingThreads={false}
            isCreatingThread={false}
            canCreateThread={isDetailView}
            onCreateThread={() => undefined}
            onCreateAssistant={callbacks?.onCreateAssistant ?? (() => undefined)}
            onBrowseAssistants={callbacks?.onBrowseAssistants ?? (() => undefined)}
            onSelectAssistant={callbacks?.onSelectAssistant ?? (() => undefined)}
            onSelectThread={() => undefined}
            onEditAssistant={callbacks?.onEditAssistant ?? (() => undefined)}
            onDeleteAssistant={callbacks?.onDeleteAssistant ?? (() => undefined)}
            onDeleteThread={() => undefined}
          />
        </MemoryRouter>
      )
    })
  }

  it('opens create assistant dialog from assistants heading in master view', () => {
    const onCreateAssistant = vi.fn()
    renderSidebar({ onCreateAssistant })

    const createAssistantButton = container.querySelector(
      '[aria-label="Create assistant"]'
    ) as HTMLButtonElement | null
    expect(createAssistantButton).not.toBeNull()

    act(() => {
      createAssistantButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onCreateAssistant).toHaveBeenCalledTimes(1)
  })

  it('shows assistant actions menu with edit and destructive delete controls in master view', () => {
    const onEditAssistant = vi.fn()
    const onDeleteAssistant = vi.fn()
    renderSidebar({ onEditAssistant, onDeleteAssistant })

    const menuTrigger = container.querySelector(
      '[aria-label="Assistant actions for Planner"]'
    ) as HTMLButtonElement | null
    expect(menuTrigger).not.toBeNull()

    act(() => {
      menuTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const editButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Edit')
    )
    const deleteButton = container.querySelector(
      '[aria-label="Delete assistant Planner"]'
    ) as HTMLButtonElement | null
    const actionsMenu = container.querySelector('[role="menu"]') as HTMLDivElement | null

    expect(editButton).not.toBeUndefined()
    expect(deleteButton).not.toBeNull()
    expect(actionsMenu).not.toBeNull()
    expect(actionsMenu?.className).toContain('bg-card')
    expect(deleteButton?.className).toContain('text-destructive')

    act(() => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onEditAssistant).toHaveBeenCalledWith('assistant-1')

    act(() => {
      menuTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const reopenedDeleteButton = container.querySelector(
      '[aria-label="Delete assistant Planner"]'
    ) as HTMLButtonElement | null
    act(() => {
      reopenedDeleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onDeleteAssistant).toHaveBeenCalledWith('assistant-1')
  })

  it('hides delete action for assistants that cannot be deleted', () => {
    const onDeleteAssistant = vi.fn()
    renderSidebar({ onDeleteAssistant, canDeleteAssistant: false })

    const menuTrigger = container.querySelector(
      '[aria-label="Assistant actions for Planner"]'
    ) as HTMLButtonElement | null
    expect(menuTrigger).not.toBeNull()

    act(() => {
      menuTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const deleteButton = container.querySelector(
      '[aria-label="Delete assistant Planner"]'
    ) as HTMLButtonElement | null

    expect(deleteButton).toBeNull()
    expect(onDeleteAssistant).not.toHaveBeenCalled()
  })

  it('shows detail view controls and lets the user return to assistants', () => {
    const onBrowseAssistants = vi.fn()
    renderSidebar({ isDetailView: true, onBrowseAssistants })

    expect(container.textContent).toContain('Current assistant')
    expect(container.textContent).toContain('Threads')

    const backButton = container.querySelector(
      '[aria-label="Back to assistants"]'
    ) as HTMLButtonElement | null
    expect(backButton).not.toBeNull()

    act(() => {
      backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onBrowseAssistants).toHaveBeenCalledTimes(1)
  })

  it('supports switching assistants from the detail header dropdown', () => {
    const onSelectAssistant = vi.fn()
    renderSidebar({
      isDetailView: true,
      onSelectAssistant,
      extraBranches: [
        {
          assistantId: 'assistant-2',
          assistantName: 'Reviewer',
          canDeleteAssistant: true,
          isSelected: false,
          threads: []
        }
      ]
    })

    const switcherTrigger = container.querySelector(
      '[aria-label="Switch assistants"]'
    ) as HTMLButtonElement | null
    expect(switcherTrigger).not.toBeNull()

    act(() => {
      switcherTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Reviewer')

    const reviewerButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Reviewer'
    )

    act(() => {
      reviewerButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectAssistant).toHaveBeenCalledWith('assistant-2')
  })

  it('filters the virtualized thread list by search text in detail view', async () => {
    const releaseThreadTitle = 'Release checklist'
    const skillThreadTitle = 'Help creating a coding skill'

    renderSidebar({
      isDetailView: true,
      threads: [
        {
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: skillThreadTitle,
          lastMessageAt: '2026-03-03T15:24:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        },
        {
          id: 'thread-2',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: releaseThreadTitle,
          lastMessageAt: '2026-03-04T15:24:00.000Z',
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z'
        }
      ]
    })

    const searchInput = container.querySelector(
      'input[aria-label="Search assistant threads"]'
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
    expect(container.textContent).not.toContain(skillThreadTitle)
  })

  it('shows only the thread title without an inline timestamp in detail view', () => {
    const threadTitle = 'Help creating a coding skill'
    renderSidebar({
      isDetailView: true,
      threads: [
        {
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: threadTitle,
          lastMessageAt: '2026-03-03T15:24:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        }
      ]
    })

    const threadButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(threadTitle)
    )
    expect(threadButton?.textContent?.trim()).toBe(threadTitle)
  })
})
