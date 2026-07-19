import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Folder,
  FolderPlus,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import type { AgentSessionSnapshot } from '../../../../shared/agent-runtime'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { isDesktopWindowsPlatform } from '../../lib/desktop-bootstrap'
import { pickDirectory } from '../../lib/desktop-features'
import { cn } from '../../lib/utils'
import {
  useCreateWorkspace,
  useWorkspaces,
  type WorkspaceRecord
} from '../../features/workspaces/workspaces-query'
import {
  useAgentSessions,
  useDeleteAgentSession,
  useSetAgentSessionPinned
} from '../../features/threads/agent-sessions-query'
import { useAutomations } from '../../features/automations/automations-query'
import { getThreadDisplayTitle, toErrorMessage } from '../../features/threads/thread-page-routing'
import { useTranslation } from '../../i18n/use-app-translation'

function isWindowsPlatform(): boolean {
  return isDesktopWindowsPlatform()
}

function toWorkspaceName(rootPath: string): string {
  const normalized = rootPath.replace(/[\\/]+$/, '')
  const segments = normalized.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? rootPath
}

function isChatsWorkspace(workspace: WorkspaceRecord): boolean {
  return workspace.builtInKind === 'chats'
}

const sidebarActionButtonClassName = 'h-10 justify-start rounded-xl px-3 text-sm'

function ThreadLink({
  thread,
  href,
  isActive,
  isPending,
  isScheduled,
  onTogglePinned,
  onDelete
}: {
  thread: AgentSessionSnapshot
  href: string
  isActive: boolean
  isPending: boolean
  isScheduled: boolean
  onTogglePinned: () => void
  onDelete: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const displayTitle = getThreadDisplayTitle(thread.title)
  const pinned = thread.pinned

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
      {isScheduled ? (
        <Clock3
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-label={t('threads.sidebar.scheduled')}
        />
      ) : null}
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
          aria-label={t(pinned ? 'threads.sidebar.unpin' : 'threads.sidebar.pin', {
            title: displayTitle
          })}
          title={t(pinned ? 'threads.sidebar.unpin' : 'threads.sidebar.pin', {
            title: displayTitle
          })}
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
          aria-label={t('threads.sidebar.delete', { title: displayTitle })}
          title={t('threads.sidebar.delete', { title: displayTitle })}
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
        {action ? <div>{action}</div> : null}
      </div>
      {isOpen ? children : null}
    </section>
  )
}

function WorkspaceThreads({
  workspace,
  activeThreadId,
  isOpen,
  scheduledSessionIds,
  scheduledSessionTitles
}: {
  workspace: WorkspaceRecord
  activeThreadId: string | null
  isOpen: boolean
  scheduledSessionIds: ReadonlySet<string>
  scheduledSessionTitles: ReadonlySet<string>
}): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deleteThreadMutation = useDeleteAgentSession()
  const updateThreadPinnedMutation = useSetAgentSessionPinned()
  const { data: threads = [] } = useAgentSessions(
    workspace.builtInKind === 'chats' ? null : workspace.id,
    isOpen
  )
  const recentThreads = useMemo(
    () =>
      [...threads].sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      ),
    [threads]
  )

  async function handleDeleteThread(thread: AgentSessionSnapshot): Promise<void> {
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

  async function handleTogglePinned(thread: AgentSessionSnapshot): Promise<void> {
    try {
      await updateThreadPinnedMutation.mutateAsync({
        sessionId: thread.id,
        pinned: !thread.pinned
      })
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  if (!isOpen) {
    return <></>
  }

  if (recentThreads.length === 0) {
    return <p className="px-8 py-1 text-xs text-muted-foreground">{t('threads.sidebar.empty')}</p>
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
          isScheduled={
            Boolean(thread.automationId) ||
            scheduledSessionIds.has(thread.id) ||
            scheduledSessionTitles.has(thread.title)
          }
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
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const { data: workspaces = [], isLoading } = useWorkspaces()
  const { data: automations = [] } = useAutomations()
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
  const scheduledSessionIds = useMemo(
    () => new Set(automations.flatMap((automation) => automation.lastSessionId ?? [])),
    [automations]
  )
  const scheduledSessionTitles = useMemo(
    () => new Set(automations.map((automation) => automation.name)),
    [automations]
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
      const selectedPath = await pickDirectory()
      if (!selectedPath) {
        return
      }

      const createdWorkspace = await createWorkspaceMutation.mutateAsync({
        name: toWorkspaceName(selectedPath),
        rootPath: selectedPath
      })
      setExpandedWorkspaceIds((current) => new Set(current).add(createdWorkspace.id))
      navigate(`/workspaces/${createdWorkspace.id}`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('threads.sidebar.createWorkspaceFailed')
      setErrorMessage(message)
      toast.error(message)
    }
  }

  if (isCollapsed) {
    return (
      <aside
        className={cn(
          'app-shell-pane flex h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-[color:var(--chat-surface-border)] px-1.5 pb-3',
          isWindowsPlatform() ? 'pt-3' : 'pt-12'
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="no-drag size-8"
          onClick={onToggleCollapsed}
          aria-label={t('appShell.nav.expandSidebar')}
          title={t('appShell.nav.expandSidebar')}
        >
          <PanelLeftOpen className="size-4" />
        </Button>
        <Button asChild variant="ghost" size="icon" className="size-8">
          <NavLink
            to={newChatHref}
            aria-label={t('appShell.nav.newChat')}
            title={t('appShell.nav.newChat')}
          >
            <MessageSquarePlus className="size-4" />
          </NavLink>
        </Button>
        <Button asChild variant="ghost" size="icon" className="size-8">
          <NavLink
            to="/skills"
            aria-label={t('appShell.nav.openSkills')}
            title={t('appShell.nav.skills')}
          >
            <Sparkles className="size-4" />
          </NavLink>
        </Button>
        <Button asChild variant="ghost" size="icon" className="size-8">
          <NavLink
            to="/automations"
            aria-label={t('appShell.nav.openSchedules')}
            title={t('appShell.nav.schedules')}
          >
            <Clock3 className="size-4" />
          </NavLink>
        </Button>
        <Button asChild variant="ghost" size="icon" className="mt-auto size-8">
          <NavLink
            to="/settings/general"
            aria-label={t('appShell.nav.openSettings')}
            title={t('appShell.nav.openSettings')}
          >
            <Settings className="size-4" />
          </NavLink>
        </Button>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        'app-shell-pane flex h-full w-[18rem] shrink-0 flex-col border-r border-[color:var(--chat-surface-border)]',
        isWindowsPlatform() ? 'pt-0' : 'pt-9'
      )}
    >
      <div className="space-y-3 border-b border-[color:var(--chat-surface-border)] px-3.5 pb-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="no-drag"
              onClick={onToggleCollapsed}
              aria-label={t('appShell.nav.collapseSidebar')}
              title={t('appShell.nav.collapseSidebar')}
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={workspaceSearchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('threads.sidebar.searchWorkspaces')}
            className="h-10 rounded-xl pl-8 text-sm"
          />
        </div>

        <Button asChild className={cn('w-full', sidebarActionButtonClassName)}>
          <NavLink to={newChatHref}>
            <MessageSquarePlus className="size-4" />
            {t('appShell.nav.newChat')}
          </NavLink>
        </Button>

        <div className="grid gap-1.5">
          <Button
            asChild
            variant="ghost"
            className={cn(sidebarActionButtonClassName, 'text-muted-foreground')}
          >
            <NavLink to="/skills">
              <Sparkles className="size-4" />
              {t('appShell.nav.skills')}
            </NavLink>
          </Button>
          <Button
            asChild
            variant="ghost"
            className={cn(sidebarActionButtonClassName, 'text-muted-foreground')}
          >
            <NavLink to="/automations">
              <Clock3 className="size-4" />
              {t('appShell.nav.schedules')}
            </NavLink>
          </Button>
        </div>
      </div>

      <div className="chat-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <SidebarSection
          title={t('threads.sidebar.workspaces')}
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
              aria-label={t('threads.sidebar.createWorkspace')}
              title={t('threads.sidebar.createWorkspace')}
            >
              <FolderPlus className="size-4" />
            </Button>
          }
        >
          {errorMessage ? <p className="px-2 text-xs text-destructive">{errorMessage}</p> : null}
          <div className="space-y-3">
            <div className="space-y-1">
              {isLoading ? (
                <p className="px-2 text-xs text-muted-foreground">
                  {t('threads.sidebar.loadingWorkspaces')}
                </p>
              ) : null}
              {namedWorkspaces.length === 0 && !isLoading ? (
                <p className="px-2 text-xs text-muted-foreground">
                  {t('threads.sidebar.noWorkspaces')}
                </p>
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
                        aria-label={t(
                          workspaceOpen
                            ? 'threads.sidebar.collapseWorkspace'
                            : 'threads.sidebar.expandWorkspace',
                          { name: workspace.name }
                        )}
                        title={t(
                          workspaceOpen
                            ? 'threads.sidebar.collapseWorkspace'
                            : 'threads.sidebar.expandWorkspace',
                          { name: workspace.name }
                        )}
                      >
                        {workspaceOpen ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </Button>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                        onClick={() => toggleWorkspaceOpen(workspace.id)}
                      >
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {workspace.name}
                        </span>
                      </button>
                      <Button
                        asChild
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                      >
                        <NavLink
                          to={`/workspaces/${workspace.id}/new`}
                          aria-label={t('threads.sidebar.newThreadInWorkspace', {
                            name: workspace.name
                          })}
                          title={t('threads.sidebar.newThreadInWorkspace', {
                            name: workspace.name
                          })}
                        >
                          <Plus className="size-3.5" />
                        </NavLink>
                      </Button>
                    </div>
                    <WorkspaceThreads
                      workspace={workspace}
                      activeThreadId={activeThreadId}
                      isOpen={workspaceOpen}
                      scheduledSessionIds={scheduledSessionIds}
                      scheduledSessionTitles={scheduledSessionTitles}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </SidebarSection>
        {errorMessage ? <p className="mt-2 px-2 text-xs text-destructive">{errorMessage}</p> : null}
        <SidebarSection
          title={t('threads.sidebar.chats')}
          isOpen={isChatsOpen}
          onToggle={() => setIsChatsOpen((current) => !current)}
          action={
            <Button asChild variant="ghost" size="icon" className="size-7">
              <NavLink
                to="/chat/new"
                aria-label={t('appShell.nav.newChat')}
                title={t('appShell.nav.newChat')}
              >
                <Plus className="size-4" />
              </NavLink>
            </Button>
          }
        >
          {chatsWorkspace ? (
            <WorkspaceThreads
              workspace={chatsWorkspace}
              activeThreadId={isChatsActive ? activeThreadId : null}
              isOpen={isChatsOpen}
              scheduledSessionIds={scheduledSessionIds}
              scheduledSessionTitles={scheduledSessionTitles}
            />
          ) : null}
        </SidebarSection>
      </div>

      <div className="border-t border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-3">
        <Button asChild variant="ghost" className="w-full justify-start">
          <NavLink to="/settings/general" aria-label={t('appShell.nav.openSettings')}>
            <Settings className="size-4" />
            {t('appShell.nav.settings')}
          </NavLink>
        </Button>
      </div>
    </aside>
  )
}
