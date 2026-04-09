import { Bot, MessageSquarePlus, Settings2, Trash2 } from 'lucide-react'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Virtuoso } from 'react-virtuoso'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useTranslation } from '../../../i18n/use-app-translation'
import { cn } from '../../../lib/utils'
import type { AssistantThreadBranch } from '../thread-page-helpers'
import { getThreadDisplayTitle } from '../thread-page-routing'
import type { ThreadRecord } from '../threads-query'

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
  onSelectAssistant: (assistantId: string) => void
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
  onSelectAssistant,
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

  return (
    <aside className="flex min-h-0 flex-col border-r border-[color:var(--surface-border)] bg-[color:var(--surface-panel)]">
      <div className="border-b border-[color:var(--surface-border)] px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-[color:var(--surface-panel-strong)] text-foreground shadow-[0_18px_40px_-34px_rgba(15,23,42,0.7)]">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] uppercase tracking-[0.22em]">TIA</p>
            <h1 className="truncate text-xl font-semibold text-foreground">Studio</h1>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button
            type="button"
            className="flex-1 justify-start rounded-2xl"
            onClick={onCreateThread}
            disabled={!canCreateThread || isCreatingThread}
          >
            <MessageSquarePlus className="size-4" />
            {isCreatingThread ? t('threads.sidebar.creatingThread') : t('threads.sidebar.newThread')}
          </Button>

          <Button asChild type="button" variant="outline" size="icon" className="rounded-2xl">
            <NavLink to="/settings/agents" aria-label="Open agent settings">
              <Settings2 className="size-4" />
            </NavLink>
          </Button>
        </div>
      </div>

      <div className="border-b border-[color:var(--surface-border)] px-5 py-4">
        <p className="text-muted-foreground text-[11px] uppercase tracking-[0.18em]">
          {t('threads.sidebar.assistants')}
        </p>
        <div className="chat-scrollbar mt-3 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
          {branches.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {isLoadingData
                ? t('threads.sidebar.loadingAssistants')
                : t('threads.sidebar.emptyAssistants')}
            </p>
          ) : (
            branches.map((branch) => (
              <button
                key={branch.assistantId}
                type="button"
                className={cn(
                  'flex items-center gap-3 rounded-[1.4rem] border px-3 py-3 text-left transition-colors',
                  branch.isSelected
                    ? 'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-active-strong)] text-foreground shadow-[0_20px_48px_-36px_rgba(15,23,42,0.7)]'
                    : 'border-transparent bg-[color:var(--surface-panel-soft)] text-muted-foreground hover:border-[color:var(--surface-border)] hover:bg-[color:var(--surface-panel)] hover:text-foreground'
                )}
                onClick={() => {
                  onSelectAssistant(branch.assistantId)
                }}
              >
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    branch.isSelected ? 'bg-primary' : 'bg-muted-foreground/40'
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{branch.assistantName}</span>
                  <span className="mt-1 block text-xs text-muted-foreground/80">
                    {branch.isSelected ? 'Selected for the next message' : 'Select to start or open threads'}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="space-y-3">
          <div>
            <p className="text-muted-foreground text-[11px] uppercase tracking-[0.18em]">
              {t('threads.sidebar.threadsLabel')}
            </p>
            {selectedBranch ? (
              <p className="text-muted-foreground mt-1 text-sm">{selectedBranch.assistantName}</p>
            ) : null}
          </div>

          <Input
            value={threadSearchQuery}
            onChange={(event) => {
              setThreadSearchQuery(event.target.value)
            }}
            placeholder={t('threads.sidebar.searchThreadsPlaceholder')}
            aria-label={t('threads.sidebar.searchThreadsAriaLabel')}
            className="rounded-2xl"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-4">
        {selectedBranch ? (
          <div className="h-full overflow-hidden rounded-[1.5rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)]">
            {isLoadingThreads ? (
              <p className="text-muted-foreground px-4 py-4 text-sm">
                {t('threads.sidebar.loadingThreads')}
              </p>
            ) : null}

            {!isLoadingThreads && selectedBranch.threads.length === 0 ? (
              <p className="text-muted-foreground px-4 py-4 text-sm">
                {t('threads.sidebar.emptyThreads')}
              </p>
            ) : null}

            {!isLoadingThreads &&
            selectedBranch.threads.length > 0 &&
            filteredThreads.length === 0 ? (
              <p className="text-muted-foreground px-4 py-4 text-sm">
                {t('threads.sidebar.emptyThreadSearch')}
              </p>
            ) : null}

            {!isLoadingThreads && filteredThreads.length > 0 ? (
              <Virtuoso
                className="chat-scrollbar h-full"
                data={filteredThreads}
                computeItemKey={(_, thread) => thread.id}
                itemContent={(_, thread) => {
                  const isActiveThread = selectedThreadId === thread.id
                  const isDeleting = deletingThreadId === thread.id
                  const isConfirmingDelete = confirmDeleteThreadId === thread.id
                  const displayTitle = getThreadDisplayTitle(thread.title)

                  return (
                    <div className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={cn(
                            'min-w-0 flex-1 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors',
                            isActiveThread
                              ? 'bg-[color:var(--surface-panel-strong)] text-foreground'
                              : 'text-muted-foreground hover:bg-[color:var(--surface-panel)] hover:text-foreground'
                          )}
                          onClick={() => onSelectThread(selectedBranch.assistantId, thread.id)}
                        >
                          <span className="block truncate font-medium">{displayTitle}</span>
                        </button>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0 rounded-xl"
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
                          className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] px-3 py-3"
                        >
                          <span className="text-xs font-medium">
                            {t('threads.sidebar.deleteThreadPrompt')}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-xl px-3 text-xs"
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
                              className="h-8 rounded-xl px-3 text-xs"
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
        ) : (
          <div className="flex h-full items-center justify-center rounded-[1.5rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-5 text-center">
            <p className="text-muted-foreground text-sm">
              {isLoadingData
                ? t('threads.sidebar.loadingAssistants')
                : t('threads.sidebar.emptyAssistants')}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-[color:var(--surface-border)] p-4">
        <Button asChild variant="ghost" className="w-full justify-start rounded-2xl">
          <NavLink to="/settings/agents">
            <Settings2 className="size-4" />
            Settings
          </NavLink>
        </Button>
      </div>
    </aside>
  )
}
