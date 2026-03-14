// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GroupSidebar } from './group-sidebar'

let container: HTMLDivElement
let root: Root

describe('GroupSidebar', () => {
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
  })

  it('selects groups and threads from the sidebar', () => {
    const onSelectGroup = vi.fn()
    const onSelectThread = vi.fn()

    act(() => {
      root.render(
        <GroupSidebar
          groups={[
            {
              id: 'group-1',
              name: 'Launch Group',
              rootPath: '/Users/demo/project',
              groupDescription: '',
              maxAutoTurns: 6,
              createdAt: '2026-03-13T00:00:00.000Z',
              updatedAt: '2026-03-13T00:00:00.000Z'
            }
          ]}
          threads={[
            {
              id: 'thread-1',
              groupId: 'group-1',
              resourceId: 'default-profile',
              title: 'Launch Room',
              lastMessageAt: null,
              createdAt: '2026-03-13T00:00:00.000Z',
              updatedAt: '2026-03-13T00:00:00.000Z'
            }
          ]}
          selectedGroupId="group-1"
          selectedThreadId={null}
          isLoadingData={false}
          isLoadingThreads={false}
          isCreatingGroup={false}
          isCreatingThread={false}
          deletingThreadId={null}
          onCreateGroup={() => undefined}
          onCreateThread={() => undefined}
          onSelectGroup={onSelectGroup}
          onSelectThread={onSelectThread}
          onDeleteThread={() => undefined}
        />
      )
    })

    const workspaceButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Launch Group')
    )
    const threadButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Launch Room')
    )

    act(() => {
      workspaceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      threadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectGroup).toHaveBeenCalledWith('group-1')
    expect(onSelectThread).toHaveBeenCalledWith('thread-1')
  })
})
