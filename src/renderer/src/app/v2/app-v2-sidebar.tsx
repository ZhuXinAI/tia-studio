import {
  Bot,
  ChevronDown,
  ChevronRight,
  Clock3,
  Folder,
  FolderPlus,
  MessageSquare,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Search,
  Settings,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { cn } from '../../lib/utils'
import {
  useCreateWorkspace,
  useWorkspaces,
  type WorkspaceRecord
} from '../../features/workspaces/workspaces-query'
import {
  useDeleteThread,
  useThreads,
  useUpdateThreadPinned,
  type ThreadRecord
} from '../../features/threads/threads-query'
import {
  getThreadDisplayTitle,
  isThreadPinned,
  sortThreadsByRecentActivity,
  toErrorMessage
} from '../../features/threads/thread-page-routing'

function isWindowsPlatform(): boolean {
  return globalThis.window?.electron?.process.platform === 'win32'
}

function toWorkspaceName(rootPath: string): string {
  const normalized = rootPath.replace(/[\\/]+$/, '')
  const segments = normalized.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? rootPath
}

function isChatsWorkspace(workspace: WorkspaceRecord): boolean {
  return workspace.builtInKind === 'chats'
}

function ThreadLink({
  thread,
  href,
  isActive,
  isPending,
  onTogglePinned,
  onDelete
}: {
  thread: ThreadRecord
  href: string
  isActive: boolean
  isPending: boolean
  onTogglePinned: () => void
  onDelete: () => void
}): React.JSX.Element {
  const displayTitle = getThreadDisplayTitle(thread.title)
  const pinned = isThreadPinned(thread)

  return (
    <div
      className={cn(
        'group/thread flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs transition-colors',
        isActive
          ? 'bg-[color:var(--surface-active)] text-foreground'
          : 'text-muted-foreground hover:bg-[color:var(--surface-muted)] hover:text-foreground'
      )}
    >
      <NavLink to={href} className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5">
        <span className="size-1.5 shrink-0 rounded-full bg-current opacity-60" />
        <span className="truncate">{displayTitle}</span>
      </NavLink>
      <div
        className={cn(
          'flex shrink-0 items-center transition-opacity group-hover/thread:opacity-100 group-focus-within/thread:opacity-100',
          pinned ? 'opacity-100' : 'opacity-0'
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={isPending}
          onClick={onTogglePinned}
          aria-label={pinned ? `Unpin ${displayTitle}` : `Pin ${displayTitle}`}
          title={pinned ? `Unpin ${displayTitle}` : `Pin ${displayTitle}`}
        >
          {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-destructive"
          disabled={isPending}
          onClick={onDelete}
          aria-label={`Delete ${displayTitle}`}
          title={`Delete ${displayTitle}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function SidebarSection({
  title,
  isOpen,
  onToggle,
  action,
  children
}: {
  title: string
  isOpen: boolean
  onToggle: () => void
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="group/section space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 text-left section-kicker"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <span className="truncate">{title}</span>
        </button>
        {action ? (
          <div className="opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100">
            {action}
          </div>
        ) : null}
      </div>
      {isOpen ? children : null}
    </section>
  )
}

function WorkspaceThreads({
  workspace,
  activeThreadId,
  isOpen
}: {
  workspace: WorkspaceRecord
  activeThreadId: string | null
  isOpen: boolean
}): React.JSX.Element {
  const navigate = useNavigate()
  const deleteThreadMutation = useDeleteThread()
  const updateThreadPinnedMutation = useUpdateThreadPinned()
  const { data: threads = [] } = useThreads(
    { workspaceId: workspace.id },
    {
      enabled: Boolean(workspace.id) && isOpen
    }
  )
  const recentThreads = useMemo(() => sortThreadsByRecentActivity(threads), [threads])

  async function handleDeleteThread(thread: ThreadRecord): Promise<void> {
    try {
      await deleteThreadMutation.mutateAsync(thread.id)
      if (activeThreadId === thread.id) {
        navigate(workspace.builtInKind === 'chats' ? '/chat' : `/workspaces/${workspace.id}`, {
          replace: true
        })
      }
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  async function handleTogglePinned(thread: ThreadRecord): Promise<void> {
    try {
      await updateThreadPinnedMutation.mutateAsync({
        threadId: thread.id,
        pinned: !isThreadPinned(thread)
      })
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  if (!isOpen) {
    return <></>
  }

  if (recentThreads.length === 0) {
    return <p className="px-8 py-1 text-xs text-muted-foreground">No threads yet.</p>
  }

  return (
    <div className="space-y-0.5 pl-4 pr-1 pt-1">
      {recentThreads.map((thread) => (
        <ThreadLink
          key={thread.id}
          thread={thread}
          href={
            workspace.builtInKind === 'chats'
              ? `/chat/${thread.id}`
              : `/workspaces/${workspace.id}/threads/${thread.id}`
          }
          isActive={activeThreadId === thread.id}
          isPending={deleteThreadMutation.isPending || updateThreadPinnedMutation.isPending}
          onTogglePinned={() => {
            void handleTogglePinned(thread)
          }}
          onDelete={() => {
            void handleDeleteThread(thread)
          }}
        />
      ))}
    </div>
  )
}

type AppV2SidebarProps = {
  isCollapsed: boolean
  onToggleCollapsed: () => void
}

export function AppV2Sidebar({
  isCollapsed,
  onToggleCollapsed
}: AppV2SidebarProps): React.JSX.Element {
  const location = useLocation()
  const params = useParams()
  const { data: workspaces = [], isLoading } = useWorkspaces()
  const createWorkspaceMutation = useCreateWorkspace()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isWorkspacesOpen, setIsWorkspacesOpen] = useState(true)
  const [isChatsOpen, setIsChatsOpen] = useState(true)
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(() => new Set())
  const workspaceSearchInputRef = useRef<HTMLInputElement | null>(null)

  const chatsWorkspace = useMemo(
    () => workspaces.find((workspace) => isChatsWorkspace(workspace)) ?? null,
    [workspaces]
  )
  const namedWorkspaces = useMemo(
    () =>
      workspaces.filter((workspace) => {
        if (isChatsWorkspace(workspace)) {
          return false
        }
        const normalizedQuery = searchQuery.trim().toLowerCase()
        return (
          normalizedQuery.length === 0 ||
          workspace.name.toLowerCase().includes(normalizedQuery) ||
          workspace.rootPath.toLowerCase().includes(normalizedQuery)
        )
      }),
    [searchQuery, workspaces]
  )
  const activeWorkspaceId = params.workspaceId ?? null
  const activeThreadId = params.threadId ?? null
  const isChatsActive = location.pathname === '/chat' || location.pathname.startsWith('/chat/')
  const newChatHref = activeWorkspaceId ? `/workspaces/${activeWorkspaceId}/new` : '/chat/new'

  function isWorkspaceOpen(workspaceId: string): boolean {
    if (activeWorkspaceId === workspaceId) {
      return true
    }

    return expandedWorkspaceIds.has(workspaceId)
  }

  function toggleWorkspaceOpen(workspaceId: string): void {
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current)
      if (next.has(workspaceId)) {
        next.delete(workspaceId)
      } else {
        next.add(workspaceId)
      }
      return next
    })
  }

  async function handleCreateWorkspace(): Promise<void> {
    setErrorMessage(null)

    try {
      const selectedPath = await window.tiaDesktop?.pickDirectory()
      if (!selectedPath) {
        return
      }

      await createWorkspaceMutation.mutateAsync({
        name: toWorkspaceName(selectedPath),
        rootPath: selectedPath
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create workspace')
    }
  }

  if (isCollapsed) {
    return (
      <aside
        className={cn(
          'flex h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel-strong)_92%,transparent),color-mix(in_srgb,var(--surface-panel)_96%,transparent))] px-1.5 pb-3',
          isWindowsPlatform() ? 'pt-3' : 'pt-12'
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="no-drag size-8"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <PanelLeftOpen className="size-4" />
        </Button>
        <Button asChild variant="ghost" size="icon" className="size-8">
          <NavLink to={newChatHref} aria-label="New chat" title="New chat">
            <MessageSquarePlus className="size-4" />
          </NavLink>
        </Button>
        <Button asChild variant="ghost" size="icon" className="size-8">
          <NavLink to="/skills" aria-label="Open skills" title="Skills">
            <Sparkles className="size-4" />
          </NavLink>
        </Button>
        <Button asChild variant="ghost" size="icon" className="size-8">
          <NavLink to="/automations" aria-label="Open automations" title="Automations">
            <Clock3 className="size-4" />
          </NavLink>
        </Button>
        <Button asChild variant="ghost" size="icon" className="mt-auto size-8">
          <NavLink to="/settings/general" aria-label="Open settings" title="Open settings">
            <Settings className="size-4" />
          </NavLink>
        </Button>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        'flex h-full w-[18rem] shrink-0 flex-col border-r border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel-strong)_92%,transparent),color-mix(in_srgb,var(--surface-panel)_96%,transparent))]',
        isWindowsPlatform() ? 'pt-0' : 'pt-9'
      )}
    >
      <div className="space-y-3 border-b border-[color:var(--surface-border)] px-3.5 pb-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="no-drag"
              onClick={onToggleCollapsed}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>
        </div>

        <Button asChild className="w-full justify-start">
          <NavLink to={newChatHref}>
            <MessageSquarePlus className="size-4" />
            New Chat
          </NavLink>
        </Button>

        <div className="grid gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start text-muted-foreground"
            onClick={() => {
              setIsWorkspacesOpen(true)
              window.requestAnimationFrame(() => workspaceSearchInputRef.current?.focus())
            }}
          >
            <Search className="size-4" />
            Search
          </Button>
          <Button asChild variant="ghost" size="sm" className="justify-start text-muted-foreground">
            <NavLink to="/skills">
              <Sparkles className="size-4" />
              Skills
            </NavLink>
          </Button>
          <Button asChild variant="ghost" size="sm" className="justify-start text-muted-foreground">
            <NavLink to="/automations">
              <Clock3 className="size-4" />
              Automations
            </NavLink>
          </Button>
        </div>
      </div>

      <div className="chat-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <SidebarSection
          title="Workspaces"
          isOpen={isWorkspacesOpen}
          onToggle={() => setIsWorkspacesOpen((current) => !current)}
          action={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => {
                void handleCreateWorkspace()
              }}
              disabled={createWorkspaceMutation.isPending}
              aria-label="Create workspace"
              title="Create workspace"
            >
              <FolderPlus className="size-4" />
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={workspaceSearchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search workspaces"
                className="h-9 pl-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              {isLoading ? (
                <p className="px-2 text-xs text-muted-foreground">Loading workspaces...</p>
              ) : null}
              {namedWorkspaces.length === 0 && !isLoading ? (
                <p className="px-2 text-xs text-muted-foreground">No named workspaces yet.</p>
              ) : null}
              {namedWorkspaces.map((workspace) => {
                const isActive = activeWorkspaceId === workspace.id
                const workspaceOpen = isWorkspaceOpen(workspace.id)
                return (
                  <div key={workspace.id}>
                    <div
                      className={cn(
                        'group/workspace flex min-w-0 items-center gap-1 rounded-xl px-1.5 py-1 text-sm transition-colors',
                        isActive
                          ? 'bg-[color:var(--surface-active)] text-foreground'
                          : 'hover:bg-[color:var(--surface-muted)]'
                      )}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={() => toggleWorkspaceOpen(workspace.id)}
                        aria-label={`${workspaceOpen ? 'Collapse' : 'Expand'} ${workspace.name}`}
                        title={`${workspaceOpen ? 'Collapse' : 'Expand'} ${workspace.name}`}
                      >
                        {workspaceOpen ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </Button>
                      <NavLink
                        to={`/workspaces/${workspace.id}`}
                        className="flex min-w-0 flex-1 items-center gap-2 py-1"
                      >
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {workspace.name}
                        </span>
                      </NavLink>
                    </div>
                    <WorkspaceThreads
                      workspace={workspace}
                      activeThreadId={activeThreadId}
                      isOpen={workspaceOpen}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </SidebarSection>
        {errorMessage ? <p className="mt-2 px-2 text-xs text-destructive">{errorMessage}</p> : null}
        <SidebarSection
          title="Chats"
          isOpen={isChatsOpen}
          onToggle={() => setIsChatsOpen((current) => !current)}
        >
          <NavLink
            to="/chat"
            className={cn(
              'flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors',
              isChatsActive
                ? 'bg-[color:var(--surface-active)] text-foreground'
                : 'hover:bg-[color:var(--surface-muted)]'
            )}
          >
            <MessageSquare className="size-4 text-muted-foreground" />
            <span className="font-medium">Chats</span>
            <span className="ml-auto rounded-full bg-[color:var(--surface-muted)] px-2 py-0.5 text-[10px] text-muted-foreground">
              Built in
            </span>
          </NavLink>
          {chatsWorkspace ? (
            <WorkspaceThreads
              workspace={chatsWorkspace}
              activeThreadId={isChatsActive ? activeThreadId : null}
              isOpen={isChatsOpen}
            />
          ) : (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Bot className="size-3.5" />
              <span>Preparing Chats...</span>
            </div>
          )}
        </SidebarSection>
      </div>

      <div className="border-t border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-3">
        <Button asChild variant="ghost" className="w-full justify-start">
          <NavLink to="/settings/general" aria-label="Open settings">
            <Settings className="size-4" />
            Settings
          </NavLink>
        </Button>
      </div>
    </aside>
  )
}
