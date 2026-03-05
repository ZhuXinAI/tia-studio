import { Bot, MessageSquarePlus, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
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
import type { AssistantThreadBranch } from '../thread-page-helpers'
import type { ThreadRecord } from '../threads-query'
import { getThreadDisplayTitle } from '../thread-page-routing'

type AssistantActionsMenuProps = {
  assistantId: string
  assistantName: string
  canDeleteAssistant: boolean
  isDeleting: boolean
  isDisabled: boolean
  onEdit: (assistantId: string) => void
  onDelete: (assistantId: string) => void
}

function AssistantActionsMenu({
  assistantId,
  assistantName,
  canDeleteAssistant,
  isDeleting,
  isDisabled,
  onEdit,
  onDelete
}: AssistantActionsMenuProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current || !(event.target instanceof Node)) {
        return
      }

      if (!containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  useEffect(() => {
    if (isDeleting) {
      setIsOpen(false)
    }
  }, [isDeleting])

  const closeAndEdit = (): void => {
    setIsOpen(false)
    onEdit(assistantId)
  }

  const closeAndDelete = (): void => {
    if (!canDeleteAssistant) {
      return
    }

    setIsOpen(false)
    onDelete(assistantId)
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label={`Assistant actions for ${assistantName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={isDisabled}
        onClick={() => {
          setIsOpen((currentState) => !currentState)
        }}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      {isOpen ? (
        <div
          role="menu"
          className="bg-card text-card-foreground border-border absolute right-0 top-8 z-10 min-w-28 rounded-md border p-1 shadow-lg"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start rounded-sm px-2 text-xs font-normal"
            role="menuitem"
            onClick={closeAndEdit}
          >
            Edit
          </Button>
          {canDeleteAssistant ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Delete assistant ${assistantName}`}
              className="text-destructive h-8 w-full justify-start rounded-sm px-2 text-xs font-normal hover:text-destructive"
              role="menuitem"
              onClick={closeAndDelete}
            >
              Delete
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type ThreadSidebarProps = {
  branches: AssistantThreadBranch[]
  selectedThreadId: string | null
  deletingThreadId: string | null
  deletingAssistantId: string | null
  isLoadingData: boolean
  assistantsCount: number
  isLoadingThreads: boolean
  isCreatingThread: boolean
  canCreateThread: boolean
  onCreateThread: () => void
  onCreateAssistant: () => void
  onSelectAssistant: (assistantId: string) => void
  onSelectThread: (assistantId: string, threadId: string) => void
  onEditAssistant: (assistantId: string) => void
  onDeleteAssistant: (assistantId: string) => void
  onDeleteThread: (thread: ThreadRecord) => void
}

export function ThreadSidebar({
  branches,
  selectedThreadId,
  deletingThreadId,
  deletingAssistantId,
  isLoadingData,
  assistantsCount,
  isLoadingThreads,
  isCreatingThread,
  canCreateThread,
  onCreateThread,
  onCreateAssistant,
  onSelectAssistant,
  onSelectThread,
  onEditAssistant,
  onDeleteAssistant,
  onDeleteThread
}: ThreadSidebarProps): React.JSX.Element {
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

  return (
    <Sidebar className="h-full w-80 border-r border-b-0">
      <SidebarHeader className="space-y-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">Main Chat</p>
          <h1 className="text-lg font-semibold">Conversations</h1>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full justify-start"
          onClick={onCreateThread}
          disabled={!canCreateThread || isCreatingThread}
        >
          <MessageSquarePlus className="size-4" />
          {isCreatingThread ? 'Creating thread...' : 'New Thread'}
        </Button>
      </SidebarHeader>

      <SidebarContent className="space-y-4">
        <SidebarGroup>
          <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel className="px-0">Assistants</SidebarGroupLabel>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Create assistant"
              onClick={onCreateAssistant}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {isLoadingData ? (
            <p className="text-muted-foreground px-2 text-xs">Loading assistants...</p>
          ) : null}
          {!isLoadingData && assistantsCount === 0 ? (
            <p className="text-muted-foreground px-2 text-xs">
              No assistants yet. Create one in Assistants.
            </p>
          ) : null}
          <SidebarMenu>
            {branches.map((branch) => (
              <SidebarMenuItem key={branch.assistantId}>
                <div className="flex items-center gap-1">
                  <SidebarMenuButton
                    type="button"
                    variant={branch.isSelected ? 'active' : 'default'}
                    className="min-w-0 flex-1"
                    onClick={() => {
                      onSelectAssistant(branch.assistantId)
                    }}
                  >
                    <Bot className="size-4 shrink-0" />
                    <span className="truncate">{branch.assistantName}</span>
                  </SidebarMenuButton>
                  <AssistantActionsMenu
                    assistantId={branch.assistantId}
                    assistantName={branch.assistantName}
                    canDeleteAssistant={branch.canDeleteAssistant}
                    isDeleting={deletingAssistantId === branch.assistantId}
                    isDisabled={Boolean(deletingAssistantId)}
                    onEdit={onEditAssistant}
                    onDelete={onDeleteAssistant}
                  />
                </div>

                {branch.isSelected ? (
                  <SidebarMenuSub>
                    {isLoadingThreads ? (
                      <SidebarMenuSubItem>
                        <p className="text-muted-foreground px-2 py-1 text-xs">
                          Loading threads...
                        </p>
                      </SidebarMenuSubItem>
                    ) : null}

                    {!isLoadingThreads && branch.threads.length === 0 ? (
                      <SidebarMenuSubItem>
                        <p className="text-muted-foreground px-2 py-1 text-xs">No threads yet.</p>
                      </SidebarMenuSubItem>
                    ) : null}

                    {branch.threads.map((thread) => {
                      const isActiveThread = selectedThreadId === thread.id
                      const isDeleting = deletingThreadId === thread.id
                      const isConfirmingDelete = confirmDeleteThreadId === thread.id
                      const displayTitle = getThreadDisplayTitle(thread.title)
                      return (
                        <SidebarMenuSubItem key={thread.id}>
                          <div className="flex items-center gap-1">
                            <SidebarMenuSubButton
                              type="button"
                              variant={isActiveThread ? 'active' : 'default'}
                              className="min-w-0 flex-1"
                              onClick={() => {
                                onSelectThread(branch.assistantId, thread.id)
                              }}
                            >
                              <span className="truncate">{displayTitle}</span>
                            </SidebarMenuSubButton>
                            <div
                              className="relative"
                              ref={isConfirmingDelete ? confirmDeleteContainerRef : undefined}
                            >
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive size-7"
                                aria-label={`Delete thread ${displayTitle}`}
                                disabled={isDeleting}
                                onClick={() => {
                                  setConfirmDeleteThreadId((current) =>
                                    current === thread.id ? null : thread.id
                                  )
                                }}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>

                              {isConfirmingDelete ? (
                                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border border-border/70 bg-card p-2 shadow-lg">
                                  <p className="text-muted-foreground mb-2 text-xs">
                                    Delete thread?
                                  </p>
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      aria-label={`Cancel delete thread ${displayTitle}`}
                                      disabled={isDeleting}
                                      onClick={() => {
                                        setConfirmDeleteThreadId(null)
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="destructive"
                                      aria-label={`Confirm delete thread ${displayTitle}`}
                                      disabled={isDeleting}
                                      onClick={() => {
                                        setConfirmDeleteThreadId(null)
                                        onDeleteThread(thread)
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
