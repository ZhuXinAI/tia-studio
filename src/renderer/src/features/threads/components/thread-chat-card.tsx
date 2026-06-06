import {
  AlertTriangle,
  Link2,
  Plus,
  Trash2
} from 'lucide-react'
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
import { useEffect } from 'react'
import type { AssistantRecord } from '../../assistants/assistants-query'
import type { ProviderRecord } from '../../settings/providers/providers-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useTranslation } from '../../../i18n/use-app-translation'
import type { AssistantReadiness } from '../thread-page-helpers'
import type { ThreadRecord } from '../threads-query'
import type { WorkspaceRecord } from '../../workspaces/workspaces-query'
import { ThreadChatMessageList } from './thread-chat-message-list'
import {
  ComposerAddAttachment,
  ComposerAttachments
} from '@renderer/components/assistant-ui/attachment'

const setupInputClassName =
  'flex h-11 w-full rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 text-sm shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)]'

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
  onCreateThread: () => void
  onSelectDraftWorkspace: (workspaceId: string) => void
  onDraftProviderChange: (providerId: string) => void
  onDraftModelChange: (model: string) => void
  onRelocateWorkspace: () => void
  onDeleteWorkspace: () => void
  isRelocatingWorkspace: boolean
  isDeletingWorkspace: boolean
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
  | 'onSubmitMessage'
  | 'onAbortGeneration'
> & {
  canCompose: boolean
  selectedWorkspace: WorkspaceRecord | null
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

  return (
    <div className="border-t border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-mineral)_34%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_55%,transparent))] p-4 sm:p-5">
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

function NewThreadSetupCard(input: {
  selectedWorkspace: WorkspaceRecord | null
  workspaces: WorkspaceRecord[]
  providers: ProviderRecord[]
  draftProviderId: string
  draftModel: string
  onSelectDraftWorkspace: (workspaceId: string) => void
  onDraftProviderChange: (providerId: string) => void
  onDraftModelChange: (model: string) => void
  onRelocateWorkspace: () => void
  onDeleteWorkspace: () => void
  isRelocatingWorkspace: boolean
  isDeletingWorkspace: boolean
}): React.JSX.Element {
  const selectedProvider =
    input.providers.find((provider) => provider.id === input.draftProviderId) ?? null
  const availableModels =
    selectedProvider?.providerModels && selectedProvider.providerModels.length > 0
      ? selectedProvider.providerModels
      : null

  return (
    <div className="mb-5 space-y-5 rounded-[1.35rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_65%,transparent))] p-5 shadow-[var(--surface-shadow)]">
      <div className="space-y-1">
        <p className="section-kicker">New chat setup</p>
        <h2 className="font-editorial text-[1.8rem] leading-none tracking-[-0.03em]">
          Choose the workspace and model before the first message.
        </h2>
        <p className="text-sm text-muted-foreground">
          The selected model is pinned to the thread after it is created.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="space-y-2 text-sm">
          <span className="section-kicker text-[0.68rem]">Workspace</span>
          <select
            className={setupInputClassName}
            value={input.selectedWorkspace?.id ?? ''}
            onChange={(event) => {
              input.onSelectDraftWorkspace(event.target.value)
            }}
          >
            {input.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="section-kicker text-[0.68rem]">Provider</span>
          <select
            className={setupInputClassName}
            value={input.draftProviderId}
            onChange={(event) => {
              input.onDraftProviderChange(event.target.value)
            }}
          >
            {input.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="section-kicker text-[0.68rem]">Model</span>
          {availableModels ? (
            <select
              className={setupInputClassName}
              value={input.draftModel}
              onChange={(event) => {
                input.onDraftModelChange(event.target.value)
              }}
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={setupInputClassName}
              value={input.draftModel}
              onChange={(event) => {
                input.onDraftModelChange(event.target.value)
              }}
              placeholder="Enter a model id"
            />
          )}
        </label>
      </div>

      {input.selectedWorkspace?.builtInKind !== 'chats' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-4 py-3">
          <div className="min-w-0">
            <p className="font-editorial text-lg leading-none">{input.selectedWorkspace?.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {input.selectedWorkspace?.rootPath}
            </p>
            {input.selectedWorkspace?.isMissing ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-3.5" />
                Folder not found. Relocate before starting new project work.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={input.onRelocateWorkspace}
              disabled={input.isRelocatingWorkspace}
            >
              {input.isRelocatingWorkspace ? 'Relocating...' : 'Relocate'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={input.onDeleteWorkspace}
              disabled={input.isDeletingWorkspace}
            >
              <Trash2 className="size-4" />
              {input.isDeletingWorkspace ? 'Deleting...' : 'Delete Workspace'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function ThreadChatCard({
  chatLabel,
  selectedWorkspace,
  workspaces,
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
  onCreateThread,
  onSelectDraftWorkspace,
  onDraftProviderChange,
  onDraftModelChange,
  onRelocateWorkspace,
  onDeleteWorkspace,
  isRelocatingWorkspace,
  isDeletingWorkspace
}: ThreadChatCardProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const runtime = useAISDKRuntime(chat)
  const isBlockedByMissingWorkspace =
    !selectedThread && selectedWorkspace?.builtInKind !== 'chats' && selectedWorkspace?.isMissing

  const canCompose =
    Boolean(selectedAssistant && readiness.canChat) &&
    !isChatStreaming &&
    !isLoadingChatHistory &&
    !isBlockedByMissingWorkspace
  const assistantName = t('threads.chat.defaultAssistantName')
  const hasRemoteBinding = Boolean(selectedThread?.channelBinding?.remoteChatId)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerClearer
        selectedAssistantId={selectedAssistant?.id}
        selectedThreadId={selectedThread?.id}
      />
      <Card className="flex min-h-0 flex-1 flex-col gap-0 rounded-none border-0 bg-transparent py-0 shadow-none">
        <CardHeader
          className="border-b border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_84%,transparent),color-mix(in_srgb,var(--surface-panel-soft)_48%,transparent))] py-3 sm:py-4"
          style={{ borderColor: 'var(--surface-border)' }}
        >
          <div className="flex h-full flex-nowrap items-center justify-between gap-3 overflow-hidden">
            <CardTitle className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0">
                  <p className="section-kicker">Conversation canvas</p>
                  <span className="font-editorial block truncate text-[1.9rem] leading-none tracking-[-0.035em]">
                    {selectedThread?.title ?? (isNewThreadRoute ? 'New Chat' : chatLabel)}
                  </span>
                </div>
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
            <div className="flex shrink-0 items-center gap-2">
              {tokenUsage && (
                <div
                  data-testid="thread-token-usage"
                  title="Persisted total token usage for this thread"
                  className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-paper)] px-3 py-1 text-xs shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_44%,transparent)]"
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedAssistant}
                onClick={onCreateThread}
              >
                <Plus className="size-4" />
                {t('threads.chat.newThread')}
              </Button>
            </div>
          </div>
        </CardHeader>

        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_96%,transparent),color-mix(in_srgb,var(--surface-panel)_82%,transparent))] py-5">
            {!selectedThread ? (
              <NewThreadSetupCard
                selectedWorkspace={selectedWorkspace}
                workspaces={workspaces}
                providers={providers}
                draftProviderId={draftProviderId}
                draftModel={draftModel}
                onSelectDraftWorkspace={onSelectDraftWorkspace}
                onDraftProviderChange={onDraftProviderChange}
                onDraftModelChange={onDraftModelChange}
                onRelocateWorkspace={onRelocateWorkspace}
                onDeleteWorkspace={onDeleteWorkspace}
                isRelocatingWorkspace={isRelocatingWorkspace}
                isDeletingWorkspace={isDeletingWorkspace}
              />
            ) : null}

            {!readiness.canChat && selectedAssistant ? (
              <p className="text-muted-foreground mb-4 rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs">
                {t('threads.chat.setupIncomplete')}
              </p>
            ) : null}

            <ThreadChatMessageList
              key={selectedThread?.id ?? `assistant:${selectedAssistant?.id ?? 'none'}`}
              threadId={selectedThread?.id ?? null}
              assistantName={assistantName}
              isLoadingChatHistory={isLoadingChatHistory}
              isChatStreaming={isChatStreaming}
              loadError={loadError}
              chatError={chatError}
            />
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
            onSubmitMessage={onSubmitMessage}
            onAbortGeneration={onAbortGeneration}
          />
        </ThreadPrimitive.Root>
      </Card>
    </AssistantRuntimeProvider>
  )
}
