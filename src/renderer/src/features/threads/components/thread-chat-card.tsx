import { AlertTriangle, Check, ChevronDown, Link2, SendHorizontal } from 'lucide-react'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState
} from '@assistant-ui/react'
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { AssistantRecord } from '../../assistants/assistants-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import { listChannels, type ConfiguredChannelRecord } from '../../settings/channels/channels-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../../components/ui/dropdown-menu'
import { useTranslation } from '../../../i18n/use-app-translation'
import type { AssistantReadiness } from '../thread-page-helpers'
import type { ThreadRecord } from '../threads-query'
import type { WorkspaceRecord } from '../../workspaces/workspaces-query'
import { ThreadChatMessageList } from './thread-chat-message-list'
import {
  ComposerAddAttachment,
  ComposerAttachments
} from '@renderer/components/assistant-ui/attachment'

type ThreadChatCardProps = {
  chatLabel: string
  selectedWorkspace: WorkspaceRecord | null
  workspaces: WorkspaceRecord[]
  providers: ProviderRecord[]
  isNewThreadRoute: boolean
  draftProviderId: string
  draftModel: string
  selectedAssistant: AssistantRecord | null
  selectedThread: ThreadRecord | null
  chat: UseChatHelpers<UIMessage>
  readiness: AssistantReadiness
  isLoadingChatHistory: boolean
  isChatStreaming: boolean
  chatError: unknown
  loadError: string | null
  canAbortGeneration: boolean
  supportsVision: boolean
  tokenUsage: ThreadRecord['usageTotals']
  onSubmitMessage: (messageText: string) => Promise<void>
  onAbortGeneration: () => void
  onSelectDraftWorkspace: (workspaceId: string) => void
  onDraftProviderChange: (providerId: string) => void
  onDraftModelChange: (model: string) => void
  onRelocateWorkspace: () => void
  onDeleteWorkspace: () => void
  isRelocatingWorkspace: boolean
  isDeletingWorkspace: boolean
  topRightActions?: React.ReactNode
}

function ComposerClearer({
  selectedAssistantId,
  selectedThreadId
}: {
  selectedAssistantId: string | undefined
  selectedThreadId: string | undefined
}): null {
  const aui = useAui()

  useEffect(() => {
    aui.composer().setText('')
  }, [aui, selectedAssistantId, selectedThreadId])

  return null
}

type ThreadChatComposerProps = Pick<
  ThreadChatCardProps,
  | 'selectedAssistant'
  | 'selectedThread'
  | 'readiness'
  | 'isChatStreaming'
  | 'canAbortGeneration'
  | 'supportsVision'
  | 'providers'
  | 'draftProviderId'
  | 'draftModel'
  | 'onDraftProviderChange'
  | 'onDraftModelChange'
  | 'onSubmitMessage'
  | 'onAbortGeneration'
> & {
  canCompose: boolean
  selectedWorkspace: WorkspaceRecord | null
  isNewThreadRoute: boolean
}

function getProviderModels(provider: ProviderRecord | null): string[] {
  if (!provider) {
    return []
  }

  const models = provider.providerModels?.length
    ? provider.providerModels
    : provider.selectedModel.trim().length > 0
      ? [provider.selectedModel]
      : []

  return [...new Set(models.map((model) => model.trim()).filter((model) => model.length > 0))]
}

function NewThreadModelPicker({
  providers,
  draftProviderId,
  draftModel,
  onDraftProviderChange,
  onDraftModelChange
}: Pick<
  ThreadChatCardProps,
  'providers' | 'draftProviderId' | 'draftModel' | 'onDraftProviderChange' | 'onDraftModelChange'
>): React.JSX.Element {
  const selectedProvider = providers.find((provider) => provider.id === draftProviderId) ?? null
  const selectedModel = draftModel.trim() || selectedProvider?.selectedModel.trim() || 'Model'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-9 max-w-[14rem] justify-start gap-2 px-2.5 text-muted-foreground"
          disabled={providers.length === 0}
          aria-label="Select model for new chat"
          title="Select model for new chat"
        >
          <span className="truncate text-xs font-medium text-foreground">{selectedModel}</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="max-h-[26rem] w-72 overflow-y-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Model for this thread
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {providers.map((provider) => {
          const models = getProviderModels(provider)
          return (
            <div key={provider.id} className="py-1">
              <DropdownMenuLabel className="px-2 py-1 text-[0.68rem] font-semibold uppercase text-muted-foreground">
                {provider.name}
              </DropdownMenuLabel>
              {models.length > 0 ? (
                models.map((model) => {
                  const isSelected = provider.id === draftProviderId && model === selectedModel
                  return (
                    <DropdownMenuItem
                      key={`${provider.id}:${model}`}
                      onSelect={() => {
                        onDraftProviderChange(provider.id)
                        onDraftModelChange(model)
                      }}
                      className="gap-2"
                    >
                      <span className="grid size-4 place-items-center">
                        {isSelected ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{model}</span>
                    </DropdownMenuItem>
                  )
                })
              ) : (
                <p className="px-8 py-1 text-xs text-muted-foreground">No saved model</p>
              )}
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useChannelIssues(): ConfiguredChannelRecord[] {
  const [channelIssues, setChannelIssues] = useState<ConfiguredChannelRecord[]>([])

  useEffect(() => {
    let isActive = true

    const refresh = async (): Promise<void> => {
      try {
        const channels = await listChannels()
        if (!isActive) {
          return
        }

        setChannelIssues(
          channels.filter((channel) => channel.status === 'error' || Boolean(channel.errorMessage))
        )
      } catch {
        if (isActive) {
          setChannelIssues([])
        }
      }
    }

    void refresh()
    const intervalId = window.setInterval(() => {
      void refresh()
    }, 30_000)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [])

  return channelIssues
}

function ThreadChatComposer({
  selectedAssistant,
  selectedThread,
  readiness,
  isChatStreaming,
  canAbortGeneration,
  canCompose,
  supportsVision,
  selectedWorkspace,
  isNewThreadRoute,
  providers,
  draftProviderId,
  draftModel,
  onDraftProviderChange,
  onDraftModelChange,
  onSubmitMessage,
  onAbortGeneration
}: ThreadChatComposerProps): React.JSX.Element {
  const { t } = useTranslation()
  const aui = useAui()
  const composerText = useAuiState((state) => (state.composer.isEditing ? state.composer.text : ''))

  const canSendMessage =
    Boolean(selectedAssistant && readiness.canChat) &&
    composerText.trim().length > 0 &&
    !isChatStreaming &&
    canCompose

  const placeholder = selectedThread
    ? t('threads.chat.composer.placeholderSelectedThread')
    : selectedAssistant
      ? t('threads.chat.composer.placeholderSelectedAssistant')
      : t('threads.chat.composer.placeholderEmpty')

  const helperText = selectedThread
    ? t('threads.chat.composer.helperSelectedThread')
    : selectedAssistant
      ? t('threads.chat.composer.helperSelectedAssistant')
      : t('threads.chat.composer.helperEmpty')

  if (!selectedThread && isNewThreadRoute) {
    return (
      <div className="flex justify-center px-5 pb-8">
        <ComposerPrimitive.Root
          className="w-full max-w-5xl space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const text = composerText.trim()
            if (text.length === 0) {
              return
            }

            aui.composer().setText('')
            await onSubmitMessage(text)
          }}
        >
          <div className="overflow-hidden rounded-[1.35rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] shadow-[0_24px_70px_-46px_rgba(15,23,42,0.55)]">
            <ComposerAttachments />
            <ComposerPrimitive.Input
              minRows={5}
              disabled={!canCompose || !readiness.canChat}
              placeholder="Do anything"
              aria-label={t('threads.chat.composer.ariaLabel')}
              className="placeholder:text-muted-foreground/70 flex w-full resize-none bg-transparent px-5 py-5 text-lg outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-2 rounded-full px-2 py-1">
                  <span className="truncate">{selectedWorkspace?.name ?? 'Chats'}</span>
                </span>
                {selectedWorkspace?.isMissing && selectedWorkspace.builtInKind !== 'chats' ? (
                  <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5" />
                    Relocate workspace
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {supportsVision && <ComposerAddAttachment />}
                <NewThreadModelPicker
                  providers={providers}
                  draftProviderId={draftProviderId}
                  draftModel={draftModel}
                  onDraftProviderChange={onDraftProviderChange}
                  onDraftModelChange={onDraftModelChange}
                />
                <ComposerPrimitive.Send asChild>
                  <Button
                    type="submit"
                    size="icon"
                    className="size-10 rounded-full"
                    disabled={!canSendMessage}
                    aria-label={t('common.actions.send')}
                    title={t('common.actions.send')}
                  >
                    <SendHorizontal className="size-4" />
                  </Button>
                </ComposerPrimitive.Send>
              </div>
            </div>
          </div>
        </ComposerPrimitive.Root>
      </div>
    )
  }

  return (
    <div className="border-t border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-subtle)_34%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_55%,transparent))] p-4 sm:p-5">
      {selectedWorkspace?.isMissing && selectedWorkspace.builtInKind !== 'chats' ? (
        <div className="mb-3 rounded-lg border border-amber-400/45 bg-amber-400/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Relocate this workspace before starting a new project thread.
        </div>
      ) : null}
      <ComposerPrimitive.Root
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault()
          const text = composerText.trim()
          if (text.length === 0) {
            return
          }

          // Clear the composer before submitting
          aui.composer().setText('')

          await onSubmitMessage(text)
        }}
      >
        <ComposerAttachments />

        <ComposerPrimitive.Input
          minRows={3}
          disabled={!canCompose || !readiness.canChat}
          placeholder={placeholder}
          aria-label={t('threads.chat.composer.ariaLabel')}
          className="placeholder:text-muted-foreground focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full rounded-[1.1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-4 py-3 text-base shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)] outline-none transition-[color,box-shadow,border-color,background-color] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:ring-[3px]"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">{helperText}</p>
          <div className="flex items-center gap-2">
            {supportsVision && <ComposerAddAttachment />}

            {isChatStreaming ? (
              <Button type="button" disabled={!canAbortGeneration} onClick={onAbortGeneration}>
                {t('common.actions.stop')}
              </Button>
            ) : (
              <ComposerPrimitive.Send asChild>
                <Button type="submit" disabled={!canSendMessage}>
                  {t('common.actions.send')}
                </Button>
              </ComposerPrimitive.Send>
            )}
          </div>
        </div>
      </ComposerPrimitive.Root>
    </div>
  )
}

export function ThreadChatCard({
  selectedWorkspace,
  providers,
  isNewThreadRoute,
  draftProviderId,
  draftModel,
  selectedAssistant,
  selectedThread,
  chat,
  readiness,
  isLoadingChatHistory,
  isChatStreaming,
  chatError,
  loadError,
  canAbortGeneration,
  supportsVision,
  tokenUsage,
  onSubmitMessage,
  onAbortGeneration,
  onDraftProviderChange,
  onDraftModelChange,
  topRightActions
}: ThreadChatCardProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const runtime = useAISDKRuntime(chat)
  const channelIssues = useChannelIssues()
  const channelIssueTitle = useMemo(() => {
    if (channelIssues.length === 0) {
      return ''
    }

    const issueNames = channelIssues
      .slice(0, 3)
      .map((channel) => channel.name)
      .join(', ')
    return channelIssues.length > 3
      ? `${issueNames}, and ${channelIssues.length - 3} more channel issues`
      : `${issueNames} needs attention`
  }, [channelIssues])
  const isBlockedByMissingWorkspace =
    !selectedThread && selectedWorkspace?.builtInKind !== 'chats' && selectedWorkspace?.isMissing

  const canCompose =
    Boolean(selectedAssistant && readiness.canChat) &&
    !isChatStreaming &&
    !isLoadingChatHistory &&
    !isBlockedByMissingWorkspace
  const assistantName = t('threads.chat.defaultAssistantName')
  const hasRemoteBinding = Boolean(selectedThread?.channelBinding?.remoteChatId)
  const selectedThreadTitle = selectedThread?.title.trim() ?? ''
  const shouldShowThreadTitleBar = Boolean(selectedThread && selectedThreadTitle.length > 0)
  const shouldShowTopRightActions = channelIssues.length > 0 || Boolean(topRightActions)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerClearer
        selectedAssistantId={selectedAssistant?.id}
        selectedThreadId={selectedThread?.id}
      />
      <Card className="relative flex min-h-0 flex-1 flex-col gap-0 rounded-none border-0 bg-transparent py-0 shadow-none">
        {shouldShowTopRightActions ? (
          <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
            {channelIssues.length > 0 ? (
              <Button
                asChild
                variant="outline"
                size="icon"
                className="size-8 border-amber-400/50 bg-amber-400/10 text-amber-700 hover:bg-amber-400/20 dark:text-amber-200"
              >
                <NavLink
                  to="/settings/channels"
                  aria-label={channelIssueTitle}
                  title={channelIssueTitle}
                >
                  <AlertTriangle className="size-4" />
                </NavLink>
              </Button>
            ) : null}
            {topRightActions}
          </div>
        ) : null}
        {shouldShowThreadTitleBar ? (
          <CardHeader
            className="border-b border-[color:var(--surface-border)] bg-transparent py-3 pr-24 sm:py-4"
            style={{ borderColor: 'var(--surface-border)' }}
          >
            <div className="flex h-full flex-nowrap items-center justify-between gap-3 overflow-hidden">
              <CardTitle className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-editorial block truncate text-[1.9rem] leading-none tracking-[-0.035em]">
                    {selectedThreadTitle}
                  </span>
                  {hasRemoteBinding ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-active)] px-2 py-0.5 text-[11px] font-medium text-primary"
                      title={t('threads.chat.remoteBadgeTitle')}
                      aria-label={t('threads.chat.remoteBadgeTitle')}
                    >
                      <Link2 className="size-3" />
                      {t('threads.chat.remoteBadge')}
                    </span>
                  ) : null}
                </div>
              </CardTitle>
              {tokenUsage && (
                <div
                  data-testid="thread-token-usage"
                  title="Persisted total token usage for this thread"
                  className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 py-1 text-xs shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)]"
                >
                  <span className="font-medium">
                    {tokenUsage.totalTokens.toLocaleString(i18n.resolvedLanguage)}
                  </span>
                  <span className="text-muted-foreground/70">{t('threads.chat.tokens')}</span>
                  <span className="text-muted-foreground/50">•</span>
                  <span className="text-muted-foreground/70">
                    {t('threads.chat.tokenInput', {
                      value: tokenUsage.inputTokens.toLocaleString(i18n.resolvedLanguage)
                    })}
                  </span>
                  <span className="text-muted-foreground/50">•</span>
                  <span className="text-muted-foreground/70">
                    {t('threads.chat.tokenOutput', {
                      value: tokenUsage.outputTokens.toLocaleString(i18n.resolvedLanguage)
                    })}
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
        ) : null}

        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel)_82%,transparent))] py-5">
            {!selectedThread && isNewThreadRoute ? (
              <div className="flex flex-1 items-end justify-center px-5 pb-8">
                <h1 className="text-center text-[clamp(2rem,4vw,3.25rem)] font-medium leading-tight">
                  What should we build in {selectedWorkspace?.name ?? 'tia-studio'}?
                </h1>
              </div>
            ) : null}

            {!readiness.canChat && selectedAssistant ? (
              <p className="text-muted-foreground mb-4 rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs">
                {t('threads.chat.setupIncomplete')}
              </p>
            ) : null}

            {selectedThread ? (
              <ThreadChatMessageList
                key={selectedThread.id}
                threadId={selectedThread.id}
                assistantName={assistantName}
                isLoadingChatHistory={isLoadingChatHistory}
                isChatStreaming={isChatStreaming}
                loadError={loadError}
                chatError={chatError}
              />
            ) : null}
          </CardContent>

          <ThreadChatComposer
            selectedWorkspace={selectedWorkspace}
            selectedAssistant={selectedAssistant}
            selectedThread={selectedThread}
            readiness={readiness}
            isChatStreaming={isChatStreaming}
            canAbortGeneration={canAbortGeneration}
            canCompose={canCompose}
            supportsVision={supportsVision}
            isNewThreadRoute={isNewThreadRoute}
            providers={providers}
            draftProviderId={draftProviderId}
            draftModel={draftModel}
            onDraftProviderChange={onDraftProviderChange}
            onDraftModelChange={onDraftModelChange}
            onSubmitMessage={onSubmitMessage}
            onAbortGeneration={onAbortGeneration}
          />
        </ThreadPrimitive.Root>
      </Card>
    </AssistantRuntimeProvider>
  )
}
