import { Folder, FolderOpen, FolderPlus, MessageSquarePlus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem
} from '../../../components/ui/sidebar'
import type { TeamThreadRecord } from '../team-threads-query'
import type { TeamWorkspaceRecord } from '../team-workspaces-query'

type TeamSidebarProps = {
  workspaces: TeamWorkspaceRecord[]
  threads: TeamThreadRecord[]
  selectedWorkspaceId: string | null
  selectedThreadId: string | null
  isLoadingData: boolean
  isLoadingThreads: boolean
  isCreatingWorkspace: boolean
  isCreatingThread: boolean
  deletingThreadId: string | null
  onCreateWorkspace: () => void
  onCreateThread: () => void
  onSelectWorkspace: (workspaceId: string) => void
  onSelectThread: (threadId: string) => void
  onDeleteThread: (thread: TeamThreadRecord) => void
}

function getTeamThreadDisplayTitle(title: string): string {
  const normalizedTitle = title.trim()
  return normalizedTitle.length > 0 ? normalizedTitle : 'Untitled Team Thread'
}

export function TeamSidebar({
  workspaces,
  threads,
  selectedWorkspaceId,
  selectedThreadId,
  isLoadingData,
  isLoadingThreads,
  isCreatingWorkspace,
  isCreatingThread,
  deletingThreadId,
  onCreateWorkspace,
  onCreateThread,
  onSelectWorkspace,
  onSelectThread,
  onDeleteThread
}: TeamSidebarProps): React.JSX.Element {
  const [confirmDeleteThreadId, setConfirmDeleteThreadId] = useState<string | null>(null)
  const confirmDeleteContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!confirmDeleteThreadId) {
      return
    }

    const handlePointerDown = (event: MouseEvent): void => {
      const container = confirmDeleteContainerRef.current
      if (!container) {
        return
      }

      if (event.target instanceof Node && !container.contains(event.target)) {
        setConfirmDeleteThreadId(null)
      }
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setConfirmDeleteThreadId(null)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [confirmDeleteThreadId])

  useEffect(() => {
    if (!deletingThreadId) {
      return
    }

    setConfirmDeleteThreadId(null)
  }, [deletingThreadId])

  return (
    <Sidebar className="h-full border-b-0">
      <SidebarHeader className="space-y-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">Team</p>
          <h1 className="text-lg font-semibold">Team Workspaces</h1>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full justify-start"
          aria-label="Create team workspace"
          disabled={isCreatingWorkspace}
          onClick={onCreateWorkspace}
        >
          <FolderPlus className="size-4" />
          {isCreatingWorkspace ? 'Creating workspace...' : 'New Workspace'}
        </Button>
      </SidebarHeader>

      <SidebarContent className="space-y-4">
        <SidebarGroup>
          <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel className="px-0">Workspaces</SidebarGroupLabel>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-label="Create team thread"
              disabled={!selectedWorkspaceId || isCreatingThread}
              onClick={onCreateThread}
            >
              <MessageSquarePlus className="size-3.5" />
              New Thread
            </Button>
          </div>

          {isLoadingData ? (
            <p role="status" className="text-muted-foreground px-2 text-xs">
              Loading team workspaces...
            </p>
          ) : null}

          {!isLoadingData && workspaces.length === 0 ? (
            <p className="text-muted-foreground px-2 text-xs">
              No workspaces yet. Create one to start a Team thread.
            </p>
          ) : null}

          <SidebarMenu>
            {workspaces.map((workspace) => {
              const isSelectedWorkspace = workspace.id === selectedWorkspaceId

              return (
                <SidebarMenuItem key={workspace.id}>
                  <SidebarMenuButton
                    type="button"
                    variant={isSelectedWorkspace ? 'active' : 'default'}
                    className="min-w-0 items-start"
                    onClick={() => onSelectWorkspace(workspace.id)}
                  >
                    {isSelectedWorkspace ? (
                      <FolderOpen className="mt-0.5 size-4 shrink-0" />
                    ) : (
                      <Folder className="mt-0.5 size-4 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{workspace.name}</span>
                      <span className="text-muted-foreground block truncate text-[11px]">
                        {workspace.rootPath}
                      </span>
                    </span>
                  </SidebarMenuButton>

                  {isSelectedWorkspace ? (
                    <SidebarMenuSub>
                      {isLoadingThreads ? (
                        <SidebarMenuSubItem>
                          <p className="text-muted-foreground px-2 py-1 text-xs">
                            Loading team threads...
                          </p>
                        </SidebarMenuSubItem>
                      ) : null}

                      {!isLoadingThreads && threads.length === 0 ? (
                        <SidebarMenuSubItem>
                          <p className="text-muted-foreground px-2 py-1 text-xs">
                            No Team threads yet.
                          </p>
                        </SidebarMenuSubItem>
                      ) : null}

                      {threads.map((thread) => {
                        const displayTitle = getTeamThreadDisplayTitle(thread.title)
                        const isConfirmingDelete = confirmDeleteThreadId === thread.id
                        const isDeletingThread = deletingThreadId === thread.id

                        return (
                          <SidebarMenuSubItem key={thread.id}>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <SidebarMenuSubButton
                                  type="button"
                                  variant={selectedThreadId === thread.id ? 'active' : 'default'}
                                  className="min-w-0 flex-1"
                                  onClick={() => onSelectThread(thread.id)}
                                >
                                  <span className="truncate">{displayTitle}</span>
                                </SidebarMenuSubButton>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 shrink-0"
                                  aria-label={`Delete team thread ${displayTitle}`}
                                  disabled={Boolean(deletingThreadId)}
                                  onClick={() => {
                                    setConfirmDeleteThreadId((currentThreadId) =>
                                      currentThreadId === thread.id ? null : thread.id
                                    )
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>

                              {isConfirmingDelete ? (
                                <div
                                  ref={confirmDeleteContainerRef}
                                  className="bg-card border-border flex items-center justify-between gap-2 rounded-md border px-2 py-2"
                                >
                                  <span className="text-xs font-medium">Delete thread?</span>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => setConfirmDeleteThreadId(null)}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="destructive"
                                      className="h-7 px-2 text-xs"
                                      aria-label={`Confirm delete team thread ${displayTitle}`}
                                      disabled={isDeletingThread}
                                      onClick={() => onDeleteThread(thread)}
                                    >
                                      {isDeletingThread ? 'Deleting...' : 'Delete'}
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
