import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenuSubButton
} from '../../../components/ui/sidebar'
import { useTranslation } from '../../../i18n/use-app-translation'
import type { TeamThreadRecord } from '../team-threads-query'
import type { TeamWorkspaceRecord } from '../team-workspaces-query'

type TeamSidebarProps = {
  selectedWorkspace: TeamWorkspaceRecord | null
  threads: TeamThreadRecord[]
  selectedThreadId: string | null
  isLoadingData: boolean
  isLoadingThreads: boolean
  isCreatingThread: boolean
  deletingThreadId: string | null
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onDeleteThread: (thread: TeamThreadRecord) => void
}

function getTeamThreadDisplayTitle(title: string, fallbackTitle: string): string {
  const normalizedTitle = title.trim()
  return normalizedTitle.length > 0 ? normalizedTitle : fallbackTitle
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function TeamSidebar({
  selectedWorkspace,
  threads,
  selectedThreadId,
  isLoadingData,
  isLoadingThreads,
  isCreatingThread,
  deletingThreadId,
  onCreateThread,
  onSelectThread,
  onDeleteThread
}: TeamSidebarProps): React.JSX.Element {
  const { t } = useTranslation()
  const [confirmDeleteThreadId, setConfirmDeleteThreadId] = useState<string | null>(null)
  const [threadSearchQuery, setThreadSearchQuery] = useState('')
  const confirmDeleteContainerRef = useRef<HTMLDivElement | null>(null)
  const deferredThreadSearchQuery = useDeferredValue(threadSearchQuery)
  const normalizedThreadSearchQuery = normalizeSearchValue(deferredThreadSearchQuery)
  const filteredThreads =
    normalizedThreadSearchQuery.length === 0
      ? threads
      : threads.filter((thread) =>
          normalizeSearchValue(
            getTeamThreadDisplayTitle(thread.title, t('team.sidebar.untitledThread'))
          ).includes(normalizedThreadSearchQuery)
        )

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

  useEffect(() => {
    setThreadSearchQuery('')
    setConfirmDeleteThreadId(null)
  }, [selectedWorkspace?.id])

  if (!selectedWorkspace) {
    return (
      <Sidebar className="h-full w-80 border-r border-b-0">
        <SidebarHeader className="space-y-3">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
              {t('team.sidebar.eyebrow')}
            </p>
            <h1 className="text-lg font-semibold">{t('team.sidebar.emptyTitle')}</h1>
            <p className="text-muted-foreground text-xs">
              {isLoadingData
                ? t('team.sidebar.loadingWorkspaces')
                : t('team.chat.noWorkspaceSelected')}
            </p>
          </div>
        </SidebarHeader>
      </Sidebar>
    )
  }

  return (
    <Sidebar className="h-full w-80 border-r border-b-0">
      <SidebarHeader className="space-y-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
            {t('team.sidebar.currentTeam')}
          </p>
          <h1 className="truncate text-lg font-semibold">{selectedWorkspace.name}</h1>
          <p className="text-muted-foreground truncate text-xs">{selectedWorkspace.rootPath}</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full justify-start"
          aria-label={t('team.sidebar.createThreadAriaLabel')}
          disabled={isCreatingThread}
          onClick={onCreateThread}
        >
          <MessageSquarePlus className="size-4" />
          {isCreatingThread ? t('team.sidebar.creatingThread') : t('team.sidebar.newThread')}
        </Button>
      </SidebarHeader>

      <SidebarContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-2 py-3">
        <SidebarGroup className="my-0 flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 px-2">
            <SidebarGroupLabel className="px-0">{t('team.sidebar.threadsLabel')}</SidebarGroupLabel>
            <Input
              value={threadSearchQuery}
              onChange={(event) => {
                setThreadSearchQuery(event.target.value)
              }}
              placeholder={t('team.sidebar.searchThreadsPlaceholder')}
              aria-label={t('team.sidebar.searchThreadsAriaLabel')}
            />
          </div>

          <div className="min-h-0 flex-1 pt-3">
            {isLoadingThreads ? (
              <p className="text-muted-foreground px-2 text-xs">
                {t('team.sidebar.loadingThreads')}
              </p>
            ) : null}

            {!isLoadingThreads && threads.length === 0 ? (
              <p className="text-muted-foreground px-2 text-xs">{t('team.sidebar.emptyThreads')}</p>
            ) : null}

            {!isLoadingThreads && threads.length > 0 && filteredThreads.length === 0 ? (
              <p className="text-muted-foreground px-2 text-xs">
                {t('team.sidebar.emptyThreadSearch')}
              </p>
            ) : null}

            {!isLoadingThreads && filteredThreads.length > 0 ? (
              <Virtuoso
                className="h-full"
                data={filteredThreads}
                computeItemKey={(_, thread) => thread.id}
                itemContent={(_, thread) => {
                  const displayTitle = getTeamThreadDisplayTitle(
                    thread.title,
                    t('team.sidebar.untitledThread')
                  )
                  const isConfirmingDelete = confirmDeleteThreadId === thread.id
                  const isDeletingThread = deletingThreadId === thread.id

                  return (
                    <div className="px-2 pb-1">
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
                          aria-label={t('team.sidebar.deleteThreadAriaLabel', {
                            title: displayTitle
                          })}
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
                          className="bg-card border-border mt-1 flex items-center justify-between gap-2 rounded-md border px-2 py-2"
                        >
                          <span className="text-xs font-medium">
                            {t('team.sidebar.deleteThreadPrompt')}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setConfirmDeleteThreadId(null)}
                            >
                              {t('common.actions.cancel')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2 text-xs"
                              aria-label={t('team.sidebar.confirmDeleteThreadAriaLabel', {
                                title: displayTitle
                              })}
                              disabled={isDeletingThread}
                              onClick={() => onDeleteThread(thread)}
                            >
                              {isDeletingThread
                                ? t('team.sidebar.deletingThread')
                                : t('common.actions.delete')}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                }}
              />
            ) : null}
          </div>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
