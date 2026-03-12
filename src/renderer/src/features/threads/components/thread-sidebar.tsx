import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Link2,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  Trash2
} from 'lucide-react'
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton
} from '../../../components/ui/sidebar'
import { useTranslation } from '../../../i18n/use-app-translation'
import { cn } from '../../../lib/utils'
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

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
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
  const { t } = useTranslation()
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
        aria-label={t('threads.sidebar.assistantActionsAriaLabel', { name: assistantName })}
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
            {t('common.actions.edit')}
          </Button>
          {canDeleteAssistant ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('threads.sidebar.deleteAssistantAriaLabel', { name: assistantName })}
              className="text-destructive h-8 w-full justify-start rounded-sm px-2 text-xs font-normal hover:text-destructive"
              role="menuitem"
              onClick={closeAndDelete}
            >
              {t('common.actions.delete')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type AssistantSwitcherProps = {
  branches: AssistantThreadBranch[]
  selectedAssistantId: string
  selectedAssistantName: string
  isDisabled: boolean
  onSelectAssistant: (assistantId: string) => void
}

function AssistantSwitcher({
  branches,
  selectedAssistantId,
  selectedAssistantName,
  isDisabled,
  onSelectAssistant
}: AssistantSwitcherProps): React.JSX.Element {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [assistantSearchQuery, setAssistantSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const deferredAssistantSearchQuery = useDeferredValue(assistantSearchQuery)
  const normalizedAssistantSearchQuery = normalizeSearchValue(deferredAssistantSearchQuery)

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
    if (!isOpen) {
      setAssistantSearchQuery('')
    }
  }, [isOpen])

  const filteredBranches =
    normalizedAssistantSearchQuery.length === 0
      ? branches
      : branches.filter((branch) =>
          normalizeSearchValue(branch.assistantName).includes(normalizedAssistantSearchQuery)
        )

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <p className="text-muted-foreground px-1 text-[10px] tracking-[0.18em] uppercase">
        {t('threads.sidebar.currentAssistant')}
      </p>
      <button
        type="button"
        className={cn(
          'group hover:bg-accent/40 focus-visible:ring-ring/50 mt-1 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left outline-none transition-colors focus-visible:ring-[3px]',
          isDisabled && 'pointer-events-none opacity-50'
        )}
        aria-label={t('threads.sidebar.assistantSwitcherAriaLabel')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        disabled={isDisabled}
        onClick={() => {
          setIsOpen((currentState) => !currentState)
        }}
      >
        <span className="truncate text-base font-semibold">{selectedAssistantName}</span>
        <ChevronDown
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform transition-opacity',
            isOpen ? 'translate-y-px opacity-100' : 'opacity-60 group-hover:opacity-100'
          )}
        />
      </button>

      {isOpen ? (
        <div className="bg-card text-card-foreground border-border absolute left-0 top-full z-20 mt-2 w-full min-w-[256px] rounded-xl border p-3 shadow-xl">
          <div className="space-y-3">
            <Input
              autoFocus
              value={assistantSearchQuery}
              onChange={(event) => {
                setAssistantSearchQuery(event.target.value)
              }}
              placeholder={t('threads.sidebar.searchAssistantsPlaceholder')}
              aria-label={t('threads.sidebar.searchAssistantsAriaLabel')}
            />

            <div className="max-h-64 overflow-y-auto pr-1">
              {filteredBranches.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-xs">
                  {t('threads.sidebar.emptyAssistantSearch')}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredBranches.map((branch) => {
                    const isSelected = branch.assistantId === selectedAssistantId
                    return (
                      <button
                        key={branch.assistantId}
                        type="button"
                        className={cn(
                          'hover:bg-accent/60 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                          isSelected && 'bg-accent text-accent-foreground'
                        )}
                        onClick={() => {
                          setIsOpen(false)
                          onSelectAssistant(branch.assistantId)
                        }}
                      >
                        <Bot className="size-4 shrink-0" />
                        <span className="truncate">{branch.assistantName}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
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
  onBrowseAssistants: () => void
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
  onBrowseAssistants,
  onSelectAssistant,
  onSelectThread,
  onEditAssistant,
  onDeleteAssistant,
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
      <Sidebar className="h-full w-80 border-r border-b-0">
        <SidebarHeader className="space-y-3">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
              {t('threads.sidebar.eyebrow')}
            </p>
            <h1 className="text-lg font-semibold">{t('threads.sidebar.title')}</h1>
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full justify-start"
            onClick={onCreateThread}
            disabled={!canCreateThread || isCreatingThread}
          >
            <MessageSquarePlus className="size-4" />
            {isCreatingThread
              ? t('threads.sidebar.creatingThread')
              : t('threads.sidebar.newThread')}
          </Button>
        </SidebarHeader>

        <SidebarContent className="space-y-4">
          <SidebarGroup>
            <div className="flex items-center justify-between px-2">
              <SidebarGroupLabel className="px-0">
                {t('threads.sidebar.assistants')}
              </SidebarGroupLabel>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('threads.sidebar.createAssistantAriaLabel')}
                onClick={onCreateAssistant}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {isLoadingData ? (
              <p className="text-muted-foreground px-2 text-xs">
                {t('threads.sidebar.loadingAssistants')}
              </p>
            ) : null}
            {!isLoadingData && assistantsCount === 0 ? (
              <p className="text-muted-foreground px-2 text-xs">
                {t('threads.sidebar.emptyAssistants')}
              </p>
            ) : null}
            <SidebarMenu>
              {branches.map((branch) => (
                <SidebarMenuItem key={branch.assistantId}>
                  <div className="flex items-center gap-1">
                    <SidebarMenuButton
                      type="button"
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
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    )
  }

  return (
    <Sidebar className="h-full w-80 border-r border-b-0">
      <SidebarHeader className="space-y-3">
        <div className="flex items-start gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-4 size-8 shrink-0"
            aria-label={t('threads.sidebar.backToAssistantsAriaLabel')}
            onClick={onBrowseAssistants}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <AssistantSwitcher
            branches={branches}
            selectedAssistantId={selectedBranch.assistantId}
            selectedAssistantName={selectedBranch.assistantName}
            isDisabled={Boolean(deletingAssistantId)}
            onSelectAssistant={onSelectAssistant}
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full justify-start"
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
                  const hasRemoteBinding = Boolean(thread.channelBinding?.remoteChatId)

                  return (
                    <div className="px-2 pb-1">
                      <div className="flex items-center gap-1">
                        <SidebarMenuSubButton
                          type="button"
                          variant={isActiveThread ? 'active' : 'default'}
                          className="min-w-0 flex-1"
                          onClick={() => {
                            onSelectThread(selectedBranch.assistantId, thread.id)
                          }}
                        >
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="truncate">{displayTitle}</span>
                            {hasRemoteBinding ? (
                              <span
                                className="shrink-0 text-blue-500/70"
                                title={t('threads.chat.remoteBadgeTitle')}
                                aria-label={t('threads.chat.remoteBadgeTitle')}
                                role="img"
                              >
                                <Link2 className="size-3" aria-hidden="true" />
                              </span>
                            ) : null}
                          </span>
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
                            aria-label={t('threads.sidebar.deleteThreadAriaLabel', {
                              title: displayTitle
                            })}
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
                                {t('threads.sidebar.deleteThreadPrompt')}
                              </p>
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  aria-label={t('threads.sidebar.cancelDeleteThreadAriaLabel', {
                                    title: displayTitle
                                  })}
                                  disabled={isDeleting}
                                  onClick={() => {
                                    setConfirmDeleteThreadId(null)
                                  }}
                                >
                                  {t('common.actions.cancel')}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  aria-label={t('threads.sidebar.confirmDeleteThreadAriaLabel', {
                                    title: displayTitle
                                  })}
                                  disabled={isDeleting}
                                  onClick={() => {
                                    setConfirmDeleteThreadId(null)
                                    onDeleteThread(thread)
                                  }}
                                >
                                  {t('common.actions.delete')}
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
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
