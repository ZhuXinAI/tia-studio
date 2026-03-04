// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadSidebar } from './thread-sidebar'

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
    onEditAssistant?: (assistantId: string) => void
    onDeleteAssistant?: (assistantId: string) => void
    canDeleteAssistant?: boolean
    threads?: Array<{
      id: string
      assistantId: string
      resourceId: string
      title: string
      lastMessageAt: string | null
      createdAt: string
      updatedAt: string
    }>
  }): void {
    act(() => {
      root.render(
        <MemoryRouter>
          <ThreadSidebar
            branches={[
              {
                assistantId: 'assistant-1',
                assistantName: 'Planner',
                canDeleteAssistant: callbacks?.canDeleteAssistant ?? true,
                isSelected: true,
                threads: callbacks?.threads ?? []
              }
            ]}
            selectedThreadId={null}
            deletingThreadId={null}
            deletingAssistantId={null}
            isLoadingData={false}
            assistantsCount={1}
            isLoadingThreads={false}
            isCreatingThread={false}
            canCreateThread={false}
            onCreateThread={() => undefined}
            onCreateAssistant={callbacks?.onCreateAssistant ?? (() => undefined)}
            onSelectAssistant={() => undefined}
            onSelectThread={() => undefined}
            onEditAssistant={callbacks?.onEditAssistant ?? (() => undefined)}
            onDeleteAssistant={callbacks?.onDeleteAssistant ?? (() => undefined)}
            onDeleteThread={() => undefined}
          />
        </MemoryRouter>
      )
    })
  }

  it('opens create assistant dialog from assistants heading', () => {
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

  it('shows assistant actions menu with edit and destructive delete controls', () => {
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
    expect(actionsMenu?.className).not.toContain('bg-popover')
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

  it('does not show "No messages yet" in the thread list timestamp slot', () => {
    renderSidebar({
      threads: [
        {
          id: 'thread-1',
          assistantId: 'assistant-1',
          resourceId: 'default-profile',
          title: 'Help creating a coding skill',
          lastMessageAt: null,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        }
      ]
    })

    expect(container.textContent).not.toContain('No messages yet')
  })
})
