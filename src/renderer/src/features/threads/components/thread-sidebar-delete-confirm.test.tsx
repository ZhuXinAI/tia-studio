// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadSidebar } from './thread-sidebar'

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data = [],
    itemContent
  }: {
    data?: Array<unknown>
    itemContent?: (index: number, item: unknown) => React.ReactNode
  }) => (
    <div>
      {data.map((item, index) => (
        <div key={index}>{itemContent ? itemContent(index, item) : null}</div>
      ))}
    </div>
  )
}))

describe('ThreadSidebar delete confirmation', () => {
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

  it('does not delete a thread until confirmed', () => {
    const onDeleteThread = vi.fn()

    act(() => {
      root.render(
        <MemoryRouter>
          <ThreadSidebar
            branches={[
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
                    title: 'Hello',
                    lastMessageAt: null,
                    createdAt: '2026-03-01T00:00:00.000Z',
                    updatedAt: '2026-03-01T00:00:00.000Z'
                  }
                ]
              }
            ]}
            selectedThreadId={null}
            deletingThreadId={null}
            isLoadingData={false}
            isLoadingThreads={false}
            isCreatingThread={false}
            canCreateThread
            onCreateThread={() => undefined}
            onSelectAssistant={() => undefined}
            onSelectThread={() => undefined}
            onDeleteThread={onDeleteThread}
          />
        </MemoryRouter>
      )
    })

    const deleteButton = container.querySelector(
      '[aria-label="Delete thread Hello"]'
    ) as HTMLButtonElement | null
    expect(deleteButton).not.toBeNull()

    act(() => {
      deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onDeleteThread).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Delete thread?')

    const confirmButton = container.querySelector(
      '[aria-label="Confirm delete thread Hello"]'
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    act(() => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onDeleteThread).toHaveBeenCalledTimes(1)
  })
})
