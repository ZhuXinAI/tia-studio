import { FolderPlus, MessageSquarePlus } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { cn } from '../../../lib/utils'
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
  onCreateWorkspace: () => void
  onCreateThread: () => void
  onSelectWorkspace: (workspaceId: string) => void
  onSelectThread: (threadId: string) => void
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
  onCreateWorkspace,
  onCreateThread,
  onSelectWorkspace,
  onSelectThread
}: TeamSidebarProps): React.JSX.Element {
  return (
    <Card className="flex h-full min-h-0 flex-col border-border/80 bg-card/78">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70">
        <CardTitle className="text-base">Team Workspaces</CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Create team workspace"
          disabled={isCreatingWorkspace}
          onClick={onCreateWorkspace}
        >
          <FolderPlus className="size-4" />
          New Workspace
        </Button>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden py-4">
        <section className="flex min-h-0 flex-col gap-2">
          {isLoadingData ? (
            <p role="status" className="text-muted-foreground text-sm">
              Loading team workspaces...
            </p>
          ) : workspaces.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No workspaces yet. Create one to start a Team thread.
            </p>
          ) : (
            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    workspace.id === selectedWorkspaceId
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/70 bg-muted/20 hover:bg-muted/40'
                  )}
                  onClick={() => onSelectWorkspace(workspace.id)}
                >
                  <p className="text-sm font-medium">{workspace.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{workspace.rootPath}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden border-t border-border/70 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Team Threads</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Create team thread"
              disabled={!selectedWorkspaceId || isCreatingThread}
              onClick={onCreateThread}
            >
              <MessageSquarePlus className="size-4" />
              New Team Thread
            </Button>
          </div>

          {selectedWorkspaceId === null ? (
            <p className="text-muted-foreground text-sm">Select a workspace to see its threads.</p>
          ) : isLoadingThreads ? (
            <p role="status" className="text-muted-foreground text-sm">
              Loading team threads...
            </p>
          ) : threads.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No Team threads yet. Create one for this workspace.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    thread.id === selectedThreadId
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/70 bg-muted/20 hover:bg-muted/40'
                  )}
                  onClick={() => onSelectThread(thread.id)}
                >
                  <p className="text-sm font-medium">{thread.title || 'Untitled Team Thread'}</p>
                  <p className="text-muted-foreground text-xs">
                    {thread.lastMessageAt ? 'Recently active' : 'No messages yet'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
