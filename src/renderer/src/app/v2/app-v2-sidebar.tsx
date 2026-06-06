import {
  Bot,
  Clock3,
  Folder,
  FolderPlus,
  MessageSquare,
  MessageSquarePlus,
  Search,
  Settings,
  Sparkles
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, useLocation, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { cn } from '../../lib/utils'
import {
  useCreateWorkspace,
  useWorkspaces,
  type WorkspaceRecord
} from '../../features/workspaces/workspaces-query'
import { useThreads, type ThreadRecord } from '../../features/threads/threads-query'
import {
  getThreadDisplayTitle,
  sortThreadsByRecentActivity
} from '../../features/threads/thread-page-routing'

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
  isActive
}: {
  thread: ThreadRecord
  href: string
  isActive: boolean
}): React.JSX.Element {
  return (
    <NavLink
      to={href}
      className={cn(
        'group flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
        isActive
          ? 'bg-[color:var(--surface-active)] text-foreground'
          : 'text-muted-foreground hover:bg-[color:var(--surface-muted)] hover:text-foreground'
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current opacity-60" />
      <span className="truncate">{getThreadDisplayTitle(thread.title)}</span>
    </NavLink>
  )
}

function WorkspaceThreads({
  workspace,
  activeThreadId
}: {
  workspace: WorkspaceRecord
  activeThreadId: string | null
}): React.JSX.Element {
  const { data: threads = [] } = useThreads(
    { workspaceId: workspace.id },
    {
      enabled: Boolean(workspace.id)
    }
  )
  const recentThreads = useMemo(() => sortThreadsByRecentActivity(threads).slice(0, 5), [threads])

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
        />
      ))}
    </div>
  )
}

export function AppV2Sidebar(): React.JSX.Element {
  const location = useLocation()
  const params = useParams()
  const { data: workspaces = [], isLoading } = useWorkspaces()
  const createWorkspaceMutation = useCreateWorkspace()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

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

  return (
    <aside className="flex h-full w-[18rem] shrink-0 flex-col border-r border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel-strong)_92%,transparent),color-mix(in_srgb,var(--surface-panel)_96%,transparent))]">
      <div className="space-y-3 border-b border-[color:var(--surface-border)] px-3.5 pb-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="section-kicker">Local agent</p>
            <h1 className="font-editorial truncate text-[1.65rem] leading-none tracking-[-0.04em]">
              TIA Studio
            </h1>
          </div>
          <Button asChild variant="ghost" size="icon" className="no-drag shrink-0">
            <NavLink to="/settings/general" aria-label="Open settings">
              <Settings className="size-4" />
            </NavLink>
          </Button>
        </div>

        <Button asChild className="w-full justify-start">
          <NavLink to={newChatHref}>
            <MessageSquarePlus className="size-4" />
            New Chat
          </NavLink>
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" size="sm" className="justify-start">
            <NavLink to="/skills">
              <Sparkles className="size-4" />
              Skills
            </NavLink>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start">
            <NavLink to="/automations">
              <Clock3 className="size-4" />
              Automations
            </NavLink>
          </Button>
        </div>
      </div>

      <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-3 space-y-2">
          <p className="section-kicker px-1">Workspaces</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search workspaces"
              className="h-9 pl-8 text-xs"
            />
          </div>
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
            return (
              <div key={workspace.id}>
                <NavLink
                  to={`/workspaces/${workspace.id}`}
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-[color:var(--surface-active)] text-foreground'
                      : 'hover:bg-[color:var(--surface-muted)]'
                  )}
                >
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{workspace.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {workspace.rootPath}
                    </span>
                  </span>
                </NavLink>
                {isActive ? (
                  <WorkspaceThreads workspace={workspace} activeThreadId={activeThreadId} />
                ) : null}
              </div>
            )
          })}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 w-full justify-start text-muted-foreground"
          onClick={() => {
            void handleCreateWorkspace()
          }}
          disabled={createWorkspaceMutation.isPending}
        >
          <FolderPlus className="size-4" />
          {createWorkspaceMutation.isPending ? 'Creating workspace...' : 'Create workspace'}
        </Button>
        {errorMessage ? <p className="mt-2 px-2 text-xs text-destructive">{errorMessage}</p> : null}
      </div>

      <div className="border-t border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-3">
        <p className="section-kicker px-1 pb-2">Chats</p>
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
          />
        ) : (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Bot className="size-3.5" />
            <span>Preparing Chats...</span>
          </div>
        )}
      </div>
    </aside>
  )
}
