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
import type { AssistantThreadBranch } from '../thread-page-helpers'
import type { ThreadRecord } from '../threads-query'
import { getThreadDisplayTitle } from '../thread-page-routing'

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

type ThreadSidebarProps = {
  branches: AssistantThreadBranch[]
  selectedThreadId: string | null
  deletingThreadId: string | null
  isLoadingData: boolean
  isLoadingThreads: boolean
  isCreatingThread: boolean
  canCreateThread: boolean
  onCreateThread: () => void
  onSelectThread: (assistantId: string, threadId: string) => void
  onDeleteThread: (thread: ThreadRecord) => void
}

export function ThreadSidebar({
  branches,
  selectedThreadId,
  deletingThreadId,
  isLoadingData,
  isLoadingThreads,
  isCreatingThread,
  canCreateThread,
  onCreateThread,
  onSelectThread,
  onDeleteThread
}: ThreadSidebarProps): React.JSX.Element {
  const { t } = useTranslation()
  const [confirmDeleteThreadId, setConfirmDeleteThreadId] = useState<string | null>(null)
  const [threadSearchQuery, setThreadSearchQuery] = useState('')
  const confirmDeleteContainerRef = useRef<HTMLDivElement | null>(null)
  const deferredThreadSearchQuery = useDeferredValue(threadSearchQuery)
  const selectedBranch = branches.find((branch) => branch.isSelected) ?? null
  const normalizedThreadSearchQuery = normalizeSearchValue(deferredThreadSearchQuery)
  const filteredThreads =
    !selectedBranch || normalizedThreadSearchQuery.length === 0
      ? (selectedBranch?.threads ?? [])
      : selectedBranch.threads.filter((thread) =>
          normalizeSearchValue(getThreadDisplayTitle(thread.title)).includes(
            normalizedThreadSearchQuery
          )
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
    setThreadSearchQuery('')
    setConfirmDeleteThreadId(null)
  }, [selectedBranch?.assistantId])

  if (!selectedBranch) {
    return (
      <Sidebar className="h-full w-80 border-r border-b-0 bg-transparent backdrop-blur-none">
        <SidebarHeader className="space-y-3">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
              {t('threads.sidebar.eyebrow')}
            </p>
            <h1 className="text-lg font-semibold">{t('threads.sidebar.title')}</h1>
            <p className="text-muted-foreground text-xs">
              {isLoadingData
                ? t('threads.sidebar.loadingAssistants')
                : t('threads.sidebar.loadingThreads')}
            </p>
          </div>
        </SidebarHeader>
      </Sidebar>
    )
  }

  return (
    <Sidebar className="h-full w-80 border-r border-b-0 bg-transparent backdrop-blur-none">
      <SidebarHeader className="space-y-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
            {t('threads.sidebar.currentAssistant')}
          </p>
          <h1 className="truncate text-lg font-semibold">{selectedBranch.assistantName}</h1>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full justify-start rounded-xl"
          onClick={onCreateThread}
          disabled={!canCreateThread || isCreatingThread}
        >
          <MessageSquarePlus className="size-4" />
          {isCreatingThread ? t('threads.sidebar.creatingThread') : t('threads.sidebar.newThread')}
        </Button>
      </SidebarHeader>

      <SidebarContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-2 py-3">
        <SidebarGroup className="my-0 flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 px-2">
            <SidebarGroupLabel className="px-0">
              {t('threads.sidebar.threadsLabel')}
            </SidebarGroupLabel>
            <Input
              value={threadSearchQuery}
              onChange={(event) => {
                setThreadSearchQuery(event.target.value)
              }}
              placeholder={t('threads.sidebar.searchThreadsPlaceholder')}
              aria-label={t('threads.sidebar.searchThreadsAriaLabel')}
            />
          </div>

          <div className="min-h-0 flex-1 pt-3">
            {isLoadingThreads ? (
              <p className="text-muted-foreground px-2 text-xs">
                {t('threads.sidebar.loadingThreads')}
              </p>
            ) : null}

            {!isLoadingThreads && selectedBranch.threads.length === 0 ? (
              <p className="text-muted-foreground px-2 text-xs">
                {t('threads.sidebar.emptyThreads')}
              </p>
            ) : null}

            {!isLoadingThreads &&
            selectedBranch.threads.length > 0 &&
            filteredThreads.length === 0 ? (
              <p className="text-muted-foreground px-2 text-xs">
                {t('threads.sidebar.emptyThreadSearch')}
              </p>
            ) : null}

            {!isLoadingThreads && filteredThreads.length > 0 ? (
              <Virtuoso
                className="h-full"
                data={filteredThreads}
                computeItemKey={(_, thread) => thread.id}
                itemContent={(_, thread) => {
                  const isActiveThread = selectedThreadId === thread.id
                  const isDeleting = deletingThreadId === thread.id
                  const isConfirmingDelete = confirmDeleteThreadId === thread.id
                  const displayTitle = getThreadDisplayTitle(thread.title)

                  return (
                    <div className="px-2 pb-1">
                      <div className="flex items-center gap-1">
                        <SidebarMenuSubButton
                          type="button"
                          variant={isActiveThread ? 'active' : 'default'}
                          className="min-w-0 flex-1"
                          onClick={() => onSelectThread(selectedBranch.assistantId, thread.id)}
                        >
                          <span className="truncate">{displayTitle}</span>
                        </SidebarMenuSubButton>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0"
                          aria-label={t('threads.sidebar.deleteThreadAriaLabel', {
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
                            {t('threads.sidebar.deleteThreadPrompt')}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              aria-label={t('threads.sidebar.cancelDeleteThreadAriaLabel', {
                                title: displayTitle
                              })}
                              onClick={() => setConfirmDeleteThreadId(null)}
                            >
                              {t('common.actions.cancel')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2 text-xs"
                              aria-label={t('threads.sidebar.confirmDeleteThreadAriaLabel', {
                                title: displayTitle
                              })}
                              disabled={isDeleting}
                              onClick={() => onDeleteThread(thread)}
                            >
                              {isDeleting
                                ? t('threads.sidebar.deletingThread')
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
