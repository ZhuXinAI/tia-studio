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

describe('thread sidebar thread navigation', () => {
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

  function renderSidebar(input?: {
    branches?: Array<{
      assistantId: string
      assistantName: string
      canDeleteAssistant: boolean
      isSelected: boolean
      threads: TestThread[]
    }>
    isLoadingData?: boolean
    isLoadingThreads?: boolean
    onCreateThread?: () => void
    onSelectThread?: (assistantId: string, threadId: string) => void
  }): void {
    act(() => {
      root.render(
        <MemoryRouter>
          <ThreadSidebar
            branches={
              input?.branches ?? [
                {
                  assistantId: 'assistant-1',
                  assistantName: 'Planner',
                  canDeleteAssistant: true,
                  isSelected: true,
                  threads: []
                }
              ]
            }
            selectedThreadId={null}
            deletingThreadId={null}
            isLoadingData={input?.isLoadingData ?? false}
            isLoadingThreads={input?.isLoadingThreads ?? false}
            isCreatingThread={false}
            canCreateThread
            onCreateThread={input?.onCreateThread ?? (() => undefined)}
            onSelectAssistant={() => undefined}
            onSelectThread={input?.onSelectThread ?? (() => undefined)}
            onDeleteThread={() => undefined}
          />
        </MemoryRouter>
      )
    })
  }

  it('shows a loading placeholder while chat route selection is being resolved', () => {
    renderSidebar({
      branches: [
        {
          assistantId: 'assistant-1',
          assistantName: 'Planner',
          canDeleteAssistant: true,
          isSelected: false,
          threads: []
        }
      ],
      isLoadingData: true
    })

    expect(container.textContent).toContain('Agents')
    expect(container.textContent).toContain('Loading agents...')
  })

  it('creates a new thread from the active assistant thread view', () => {
    const onCreateThread = vi.fn()
    renderSidebar({ onCreateThread })

    const createThreadButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('New chat')
    )
    expect(createThreadButton).not.toBeUndefined()

    act(() => {
      createThreadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onCreateThread).toHaveBeenCalledTimes(1)
  })

  it('filters the virtualized thread list by search text in the active assistant view', async () => {
    const releaseThreadTitle = 'Release checklist'
    const skillThreadTitle = 'Help creating a coding skill'

    renderSidebar({
      branches: [
        {
          assistantId: 'assistant-1',
          assistantName: 'Planner',
          canDeleteAssistant: true,
          isSelected: true,
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

  it('shows only the thread title without an inline timestamp in the active assistant view', () => {
    const threadTitle = 'Help creating a coding skill'
    renderSidebar({
      branches: [
        {
          assistantId: 'assistant-1',
          assistantName: 'Planner',
          canDeleteAssistant: true,
          isSelected: true,
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
        }
      ]
    })

    const threadButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(threadTitle)
    )
    expect(threadButton?.textContent?.trim()).toBe(threadTitle)
  })
})
