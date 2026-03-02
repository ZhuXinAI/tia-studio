import { Link } from 'react-router-dom'
import { Bot, MessageSquarePlus, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { formatThreadTimestamp } from '../thread-page-routing'

type ThreadSidebarProps = {
  branches: AssistantThreadBranch[]
  selectedThreadId: string | null
  deletingThreadId: string | null
  isLoadingData: boolean
  assistantsCount: number
  isLoadingThreads: boolean
  isCreatingThread: boolean
  canCreateThread: boolean
  onCreateThread: () => void
  onSelectAssistant: (assistantId: string) => void
  onSelectThread: (assistantId: string, threadId: string) => void
  onDeleteThread: (thread: ThreadRecord) => void
}

export function ThreadSidebar({
  branches,
  selectedThreadId,
  deletingThreadId,
  isLoadingData,
  assistantsCount,
  isLoadingThreads,
  isCreatingThread,
  canCreateThread,
  onCreateThread,
  onSelectAssistant,
  onSelectThread,
  onDeleteThread
}: ThreadSidebarProps): React.JSX.Element {
  return (
    <Sidebar className="h-auto w-full border-r-0 border-b md:h-full md:w-80 md:border-r md:border-b-0">
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
          <SidebarGroupLabel>Assistants</SidebarGroupLabel>
          {isLoadingData ? <p className="text-muted-foreground px-2 text-xs">Loading assistants...</p> : null}
          {!isLoadingData && assistantsCount === 0 ? (
            <p className="text-muted-foreground px-2 text-xs">
              No assistants yet. Create one in Assistants.
            </p>
          ) : null}
          <SidebarMenu>
            {branches.map((branch) => (
              <SidebarMenuItem key={branch.assistantId}>
                <SidebarMenuButton
                  type="button"
                  variant={branch.isSelected ? 'active' : 'default'}
                  onClick={() => {
                    onSelectAssistant(branch.assistantId)
                  }}
                >
                  <Bot className="size-4 shrink-0" />
                  <span className="truncate">{branch.assistantName}</span>
                </SidebarMenuButton>

                {branch.isSelected ? (
                  <SidebarMenuSub>
                    {isLoadingThreads ? (
                      <SidebarMenuSubItem>
                        <p className="text-muted-foreground px-2 py-1 text-xs">Loading threads...</p>
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
                              <span className="truncate">{thread.title}</span>
                              <span className="text-[11px] opacity-80">
                                {formatThreadTimestamp(thread.lastMessageAt)}
                              </span>
                            </SidebarMenuSubButton>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive size-7"
                              aria-label={`Delete thread ${thread.title}`}
                              disabled={isDeleting}
                              onClick={() => onDeleteThread(thread)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
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

      <SidebarFooter className="grid gap-1">
        <Button asChild variant="ghost" size="sm" className="w-full justify-start">
          <Link to="/assistants">Manage Assistants</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="w-full justify-start">
          <Link to="/settings/providers">Provider Settings</Link>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
