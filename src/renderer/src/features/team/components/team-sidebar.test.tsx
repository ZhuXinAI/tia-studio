// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamSidebar } from './team-sidebar'

let container: HTMLDivElement
let root: Root

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
  })

  it('selects workspaces and threads from the sidebar', () => {
    const onSelectWorkspace = vi.fn()
    const onSelectThread = vi.fn()

    act(() => {
      root.render(
        <TeamSidebar
          workspaces={[
            {
              id: 'workspace-1',
              name: 'Docs Workspace',
              rootPath: '/Users/demo/project',
              teamDescription: '',
              supervisorProviderId: null,
              supervisorModel: '',
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]}
          threads={[
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
          ]}
          selectedWorkspaceId="workspace-1"
          selectedThreadId={null}
          isLoadingData={false}
          isLoadingThreads={false}
          isCreatingWorkspace={false}
          isCreatingThread={false}
          deletingThreadId={null}
          onCreateWorkspace={() => undefined}
          onCreateThread={() => undefined}
          onSelectWorkspace={onSelectWorkspace}
          onSelectThread={onSelectThread}
          onDeleteThread={() => undefined}
        />
      )
    })

    const workspaceButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Docs Workspace')
    )
    const threadButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Release Team')
    )

    act(() => {
      workspaceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      threadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectWorkspace).toHaveBeenCalledWith('workspace-1')
    expect(onSelectThread).toHaveBeenCalledWith('thread-1')
    expect(container.querySelector('[data-slot="sidebar-menu-sub"]')).not.toBeNull()
  })

  it('fires the create workspace and create thread actions', () => {
    const onCreateWorkspace = vi.fn()
    const onCreateThread = vi.fn()

    act(() => {
      root.render(
        <TeamSidebar
          workspaces={[]}
          threads={[]}
          selectedWorkspaceId="workspace-1"
          selectedThreadId={null}
          isLoadingData={false}
          isLoadingThreads={false}
          isCreatingWorkspace={false}
          isCreatingThread={false}
          deletingThreadId={null}
          onCreateWorkspace={onCreateWorkspace}
          onCreateThread={onCreateThread}
          onSelectWorkspace={() => undefined}
          onSelectThread={() => undefined}
          onDeleteThread={() => undefined}
        />
      )
    })

    const createWorkspaceButton = container.querySelector(
      '[aria-label="Create team workspace"]'
    ) as HTMLButtonElement | null
    const createThreadButton = container.querySelector(
      '[aria-label="Create team thread"]'
    ) as HTMLButtonElement | null

    act(() => {
      createWorkspaceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      createThreadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onCreateWorkspace).toHaveBeenCalledTimes(1)
    expect(onCreateThread).toHaveBeenCalledTimes(1)
  })

  it('shows nested thread items only for the selected workspace', () => {
    act(() => {
      root.render(
        <TeamSidebar
          workspaces={[
            {
              id: 'workspace-1',
              name: 'Docs Workspace',
              rootPath: '/Users/demo/project',
              teamDescription: '',
              supervisorProviderId: null,
              supervisorModel: '',
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            },
            {
              id: 'workspace-2',
              name: 'App Workspace',
              rootPath: '/Users/demo/app',
              teamDescription: '',
              supervisorProviderId: null,
              supervisorModel: '',
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]}
          threads={[
            {
              id: 'thread-1',
              workspaceId: 'workspace-1',
              resourceId: 'default-profile',
              title: '',
              teamDescription: '',
              supervisorProviderId: null,
              supervisorModel: '',
              lastMessageAt: null,
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]}
          selectedWorkspaceId="workspace-1"
          selectedThreadId={null}
          isLoadingData={false}
          isLoadingThreads={false}
          isCreatingWorkspace={false}
          isCreatingThread={false}
          deletingThreadId={null}
          onCreateWorkspace={() => undefined}
          onCreateThread={() => undefined}
          onSelectWorkspace={() => undefined}
          onSelectThread={() => undefined}
          onDeleteThread={() => undefined}
        />
      )
    })

    expect(container.textContent).toContain('Untitled Team Thread')
    expect(container.textContent).toContain('App Workspace')
  })

  it('does not delete a team thread until confirmed', () => {
    const onDeleteThread = vi.fn()

    act(() => {
      root.render(
        <TeamSidebar
          workspaces={[
            {
              id: 'workspace-1',
              name: 'Docs Workspace',
              rootPath: '/Users/demo/project',
              teamDescription: '',
              supervisorProviderId: null,
              supervisorModel: '',
              createdAt: '2026-03-07T00:00:00.000Z',
              updatedAt: '2026-03-07T00:00:00.000Z'
            }
          ]}
          threads={[
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
          ]}
          selectedWorkspaceId="workspace-1"
          selectedThreadId="thread-1"
          isLoadingData={false}
          isLoadingThreads={false}
          isCreatingWorkspace={false}
          isCreatingThread={false}
          deletingThreadId={null}
          onCreateWorkspace={() => undefined}
          onCreateThread={() => undefined}
          onSelectWorkspace={() => undefined}
          onSelectThread={() => undefined}
          onDeleteThread={onDeleteThread}
        />
      )
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
