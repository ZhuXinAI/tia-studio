import { AlertCircle, ExternalLink, Link2, LoaderIcon } from 'lucide-react'
import { getToolName, isToolUIPart, type UIMessage } from 'ai'
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
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { useTranslation } from '../../../i18n/use-app-translation'
import type { AssistantRecord } from '../../assistants/assistants-query'
import type { AssistantReadiness } from '../thread-page-helpers'
import { getThreadDisplayTitle } from '../thread-page-routing'
import type { ThreadRecord } from '../threads-query'
import { showBuiltInBrowserWindow } from '../built-in-browser-query'
import { ThreadChatMessageList } from './thread-chat-message-list'
import {
  ComposerAddAttachment,
  ComposerAttachments
} from '@renderer/components/assistant-ui/attachment'

type ThreadChatCardProps = {
  assistantOptions: Array<{
    id: string
    name: string
    description: string
    origin: AssistantRecord['origin']
  }>
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
  onSelectAssistant: (assistantId: string) => void
  onOpenAgentSettings: () => void
}

type ActiveBuiltInBrowserHandoff = {
  message: string | null
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
  variant: 'dock' | 'hero'
}

const emptyStatePrompts = [
  'Review this repository structure',
  'Plan a safe refactor',
  'Summarize the current workspace',
  'Set up an ACP agent workflow'
]

function resolveAssistantOriginLabel(assistantOrigin: AssistantRecord['origin']): string {
  if (assistantOrigin === 'external-acp') {
    return 'ACP agent'
  }

  if (assistantOrigin === 'built-in') {
    return 'Built-in'
  }

  return 'TIA agent'
}

function normalizeToolName(toolName: string): string {
  return toolName.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function isBuiltInBrowserHandoffToolName(toolName: string): boolean {
  return normalizeToolName(toolName) === 'requestbrowserhumanhandoff'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readHandoffMessageCandidate(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (!isRecord(value)) {
    return null
  }

  const directMessage =
    typeof value.message === 'string' && value.message.trim().length > 0
      ? value.message.trim()
      : null
  if (directMessage) {
    return directMessage
  }

  return null
}

function extractHandoffMessageFromToolInput(input: unknown): string | null {
  return readHandoffMessageCandidate(input)
}

function extractActiveBuiltInBrowserHandoff(
  messages: readonly UIMessage[]
): ActiveBuiltInBrowserHandoff | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    const parts = Array.isArray(message?.parts) ? message.parts : []

    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const rawPart = parts[partIndex]
      if (!isToolUIPart(rawPart)) {
        continue
      }

      if (!isBuiltInBrowserHandoffToolName(getToolName(rawPart))) {
        continue
      }

      if (
        rawPart.state === 'output-available' ||
        rawPart.state === 'output-error' ||
        rawPart.state === 'output-denied'
      ) {
        continue
      }

      return {
        message: extractHandoffMessageFromToolInput(rawPart.input)
      }
    }
  }

  return null
}

function BuiltInBrowserHandoffBanner(): React.JSX.Element | null {
  const { t } = useTranslation()
  const [isShowingBrowser, setIsShowingBrowser] = useState(false)
  const messages = useAuiState((state) => state.thread.messages) as unknown as readonly UIMessage[]
  const activeHandoff = useMemo(() => extractActiveBuiltInBrowserHandoff(messages), [messages])

  if (!activeHandoff) {
    return null
  }

  const handleShowBrowser = async (): Promise<void> => {
    setIsShowingBrowser(true)

    try {
      await showBuiltInBrowserWindow()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('threads.chat.handoffBanner.showFailed')
      )
    } finally {
      setIsShowingBrowser(false)
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="built-in-browser-handoff-banner"
      className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-[1.5rem] border border-amber-400/45 bg-amber-400/10 px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <p className="text-sm font-medium">{t('threads.chat.handoffBanner.title')}</p>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('threads.chat.handoffBanner.description')}
        </p>
        {activeHandoff.message ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {t('threads.chat.handoffBanner.details', {
              message: activeHandoff.message
            })}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 rounded-full"
        disabled={isShowingBrowser}
        onClick={() => void handleShowBrowser()}
      >
        {isShowingBrowser ? (
          <LoaderIcon className="size-4 animate-spin" />
        ) : (
          <ExternalLink className="size-4" />
        )}
        {t('threads.chat.handoffBanner.showBrowser')}
      </Button>
    </div>
  )
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

function ThreadChatStatus({
  isLoadingChatHistory,
  isChatStreaming,
  loadError,
  chatError
}: Pick<
  ThreadChatCardProps,
  'isLoadingChatHistory' | 'isChatStreaming' | 'loadError' | 'chatError'
>): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      {isLoadingChatHistory ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t('threads.messageList.loadingHistory')}
        </p>
      ) : null}

      {isChatStreaming ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t('threads.messageList.responding')}
        </p>
      ) : null}

      {chatError ? (
        <p role="alert" className="text-destructive text-sm">
          {chatError instanceof Error ? chatError.message : t('common.errors.unexpectedRequest')}
        </p>
      ) : null}

      {loadError ? (
        <p
          role="alert"
          className="text-destructive rounded-[1.25rem] border border-destructive/60 px-3 py-2 text-sm"
        >
          {loadError}
        </p>
      ) : null}
    </>
  )
}

function ThreadChatComposer({
  selectedAssistant,
  selectedThread,
  readiness,
  isChatStreaming,
  canAbortGeneration,
  canCompose,
  supportsVision,
  onSubmitMessage,
  onAbortGeneration,
  variant
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

  const wrapperClassName =
    variant === 'hero'
      ? 'w-full rounded-[2rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-4 shadow-[0_30px_80px_-54px_rgba(15,23,42,0.82)] sm:p-5'
      : 'border-t border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] px-4 py-4 sm:px-6 sm:py-5'

  const inputClassName =
    variant === 'hero'
      ? 'placeholder:text-muted-foreground focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full rounded-[1.75rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-muted)] px-5 py-4 text-lg shadow-none outline-none transition-[color,box-shadow,border-color,background-color] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-[3px]'
      : 'placeholder:text-muted-foreground focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full rounded-[1.5rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-muted)] px-4 py-3 text-base shadow-none outline-none transition-[color,box-shadow,border-color,background-color] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:ring-[3px]'

  return (
    <div className={wrapperClassName}>
      <ComposerPrimitive.Root
        className="space-y-3"
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
        <ComposerAttachments />

        <ComposerPrimitive.Input
          minRows={variant === 'hero' ? 5 : 3}
          disabled={!canCompose || !readiness.canChat}
          placeholder={placeholder}
          aria-label={t('threads.chat.composer.ariaLabel')}
          className={inputClassName}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {supportsVision && <ComposerAddAttachment />}
            <p className="text-muted-foreground text-xs">{helperText}</p>
          </div>

          <div className="flex items-center gap-2">
            {isChatStreaming ? (
              <Button
                type="button"
                className="rounded-full"
                disabled={!canAbortGeneration}
                onClick={onAbortGeneration}
              >
                {t('common.actions.stop')}
              </Button>
            ) : (
              <ComposerPrimitive.Send asChild>
                <Button type="submit" className="rounded-full px-5" disabled={!canSendMessage}>
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

function AgentSelector({
  assistantOptions,
  selectedAssistant,
  onSelectAssistant,
  onOpenAgentSettings
}: Pick<
  ThreadChatCardProps,
  'assistantOptions' | 'selectedAssistant' | 'onSelectAssistant' | 'onOpenAgentSettings'
>) {
  return (
    <div className="rounded-[2rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-3 shadow-[0_22px_60px_-44px_rgba(15,23,42,0.82)]">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {assistantOptions.map((assistant) => {
          const isSelected = selectedAssistant?.id === assistant.id
          const description = assistant.description.trim()
          return (
            <button
              key={assistant.id}
              type="button"
              className={
                isSelected
                  ? 'rounded-[1.5rem] border border-[color:var(--surface-border-strong)] bg-[color:var(--surface-active-strong)] px-4 py-3 text-left shadow-[0_20px_48px_-36px_rgba(15,23,42,0.82)]'
                  : 'rounded-[1.5rem] border border-transparent bg-[color:var(--surface-panel-soft)] px-4 py-3 text-left transition-colors hover:border-[color:var(--surface-border)] hover:bg-[color:var(--surface-panel)]'
              }
              onClick={() => {
                onSelectAssistant(assistant.id)
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-foreground">{assistant.name}</span>
                <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {resolveAssistantOriginLabel(assistant.origin)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                {description.length > 0
                  ? description
                  : 'Select this agent and your first message will start a new thread immediately.'}
              </p>
            </button>
          )
        })}
      </div>

      {assistantOptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-[color:var(--surface-border)] px-5 py-8 text-center">
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            No chat agents are ready yet. Install a local ACP agent or configure a TIA agent to
            start here.
          </p>
          <Button type="button" variant="outline" className="rounded-full" onClick={onOpenAgentSettings}>
            Open settings
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function EmptyStatePromptChips(): React.JSX.Element {
  const aui = useAui()

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {emptyStatePrompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-[color:var(--surface-border-strong)] hover:bg-[color:var(--surface-panel)] hover:text-foreground"
          onClick={() => {
            aui.composer().setText(prompt)
          }}
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}

function ThreadHeroEmptyState(
  props: Pick<
    ThreadChatCardProps,
    | 'assistantOptions'
    | 'selectedAssistant'
    | 'readiness'
    | 'isChatStreaming'
    | 'canAbortGeneration'
    | 'supportsVision'
    | 'onSubmitMessage'
    | 'onAbortGeneration'
    | 'onSelectAssistant'
    | 'onOpenAgentSettings'
  > & {
    canCompose: boolean
  }
): React.JSX.Element {
  const { selectedAssistant } = props

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="w-full max-w-5xl space-y-8">
        <div className="space-y-3 text-center">
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.24em]">
            ACP-first workspace
          </p>
          <h2 className="text-4xl font-semibold tracking-[-0.04em] text-foreground">
            Hi, what&apos;s your plan for today?
          </h2>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-muted-foreground">
            Select any installed ACP agent or one of your TIA agents below. Your first message
            starts the thread directly, without opening a setup page.
          </p>
        </div>

        <AgentSelector
          assistantOptions={props.assistantOptions}
          selectedAssistant={selectedAssistant}
          onSelectAssistant={props.onSelectAssistant}
          onOpenAgentSettings={props.onOpenAgentSettings}
        />

        <div className="mx-auto max-w-4xl">
          <ThreadChatComposer
            selectedAssistant={props.selectedAssistant}
            selectedThread={null}
            readiness={props.readiness}
            isChatStreaming={props.isChatStreaming}
            canAbortGeneration={props.canAbortGeneration}
            canCompose={props.canCompose}
            supportsVision={props.supportsVision}
            onSubmitMessage={props.onSubmitMessage}
            onAbortGeneration={props.onAbortGeneration}
            variant="hero"
          />
        </div>

        <EmptyStatePromptChips />
      </div>
    </div>
  )
}

function ThreadHeader({
  selectedAssistant,
  selectedThread,
  tokenUsage
}: Pick<ThreadChatCardProps, 'selectedAssistant' | 'selectedThread' | 'tokenUsage'>) {
  const { t, i18n } = useTranslation()
  const assistantName = selectedAssistant?.name ?? t('threads.chat.defaultAssistantName')
  const hasRemoteBinding = Boolean(selectedThread?.channelBinding?.remoteChatId)
  const title = selectedThread
    ? getThreadDisplayTitle(selectedThread.title)
    : selectedAssistant
      ? t('threads.chat.titleWithAssistant', { name: assistantName })
      : 'ACP workspace'
  const subtitle = selectedAssistant
    ? selectedThread
      ? 'Focused session with full thread history'
      : 'Start a fresh thread with a short prompt or a dropped file'
    : 'Select an agent or open Settings to configure one'

  return (
    <header className="border-b border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {selectedAssistant?.name ?? 'No agent selected'}
            </span>
            {hasRemoteBinding ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-200"
                title={t('threads.chat.remoteBadgeTitle')}
                aria-label={t('threads.chat.remoteBadgeTitle')}
              >
                <Link2 className="size-3" />
                {t('threads.chat.remoteBadge')}
              </span>
            ) : null}
          </div>

          <h1 className="mt-3 truncate text-[clamp(1.4rem,1.3rem+0.4vw,1.85rem)] font-semibold tracking-[-0.04em] text-foreground">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        {tokenUsage ? (
          <div
            data-testid="thread-token-usage"
            title="Persisted total token usage for this thread"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-3 py-1 text-xs"
          >
            <span className="font-medium">
              {tokenUsage.totalTokens.toLocaleString(i18n.resolvedLanguage)}
            </span>
            <span className="text-muted-foreground/70">{t('threads.chat.tokens')}</span>
          </div>
        ) : null}
      </div>
    </header>
  )
}

function ThreadBody(
  props: Pick<
    ThreadChatCardProps,
    | 'assistantOptions'
    | 'selectedAssistant'
    | 'selectedThread'
    | 'readiness'
    | 'isLoadingChatHistory'
    | 'isChatStreaming'
    | 'chatError'
    | 'loadError'
    | 'canAbortGeneration'
    | 'supportsVision'
    | 'onSubmitMessage'
    | 'onAbortGeneration'
    | 'onSelectAssistant'
    | 'onOpenAgentSettings'
  >
): React.JSX.Element {
  const messages = useAuiState((state) => state.thread.messages)
  const hasMessages = messages.length > 0
  const canCompose =
    Boolean(props.selectedAssistant && props.readiness.canChat) &&
    !props.isChatStreaming &&
    !props.isLoadingChatHistory
  const showHero = !hasMessages && !props.isLoadingChatHistory

  if (showHero) {
    return (
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <div className="px-6 pt-5">
          <ThreadChatStatus
            isLoadingChatHistory={props.isLoadingChatHistory}
            isChatStreaming={props.isChatStreaming}
            loadError={props.loadError}
            chatError={props.chatError}
          />
        </div>
        <ThreadHeroEmptyState
          assistantOptions={props.assistantOptions}
          selectedAssistant={props.selectedAssistant}
          readiness={props.readiness}
          isChatStreaming={props.isChatStreaming}
          canAbortGeneration={props.canAbortGeneration}
          supportsVision={props.supportsVision}
          onSubmitMessage={props.onSubmitMessage}
          onAbortGeneration={props.onAbortGeneration}
          onSelectAssistant={props.onSelectAssistant}
          onOpenAgentSettings={props.onOpenAgentSettings}
          canCompose={canCompose}
        />
      </ThreadPrimitive.Root>
    )
  }

  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-5">
        <BuiltInBrowserHandoffBanner />

        {!props.readiness.canChat && props.selectedAssistant ? (
          <p className="text-muted-foreground mb-4 rounded-[1.25rem] border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs">
            Setup is incomplete. Finish provider or model setup in Settings before sending.
          </p>
        ) : null}

        <ThreadChatMessageList
          key={props.selectedThread?.id ?? `assistant:${props.selectedAssistant?.id ?? 'none'}`}
          threadId={props.selectedThread?.id ?? null}
          assistantName={props.selectedAssistant?.name ?? 'Assistant'}
          isLoadingChatHistory={props.isLoadingChatHistory}
          isChatStreaming={props.isChatStreaming}
          loadError={props.loadError}
          chatError={props.chatError}
        />
      </div>

      <ThreadChatComposer
        selectedAssistant={props.selectedAssistant}
        selectedThread={props.selectedThread}
        readiness={props.readiness}
        isChatStreaming={props.isChatStreaming}
        canAbortGeneration={props.canAbortGeneration}
        canCompose={canCompose}
        supportsVision={props.supportsVision}
        onSubmitMessage={props.onSubmitMessage}
        onAbortGeneration={props.onAbortGeneration}
        variant="dock"
      />
    </ThreadPrimitive.Root>
  )
}

export function ThreadChatCard({
  assistantOptions,
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
  onSelectAssistant,
  onOpenAgentSettings
}: ThreadChatCardProps): React.JSX.Element {
  const runtime = useAISDKRuntime(chat)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerClearer
        selectedAssistantId={selectedAssistant?.id}
        selectedThreadId={selectedThread?.id}
      />

      <section className="flex min-h-0 flex-1 flex-col bg-[color:var(--surface-canvas)]">
        <ThreadHeader
          selectedAssistant={selectedAssistant}
          selectedThread={selectedThread}
          tokenUsage={tokenUsage}
        />

        <ThreadBody
          assistantOptions={assistantOptions}
          selectedAssistant={selectedAssistant}
          selectedThread={selectedThread}
          readiness={readiness}
          isLoadingChatHistory={isLoadingChatHistory}
          isChatStreaming={isChatStreaming}
          chatError={chatError}
          loadError={loadError}
          canAbortGeneration={canAbortGeneration}
          supportsVision={supportsVision}
          onSubmitMessage={onSubmitMessage}
          onAbortGeneration={onAbortGeneration}
          onSelectAssistant={onSelectAssistant}
          onOpenAgentSettings={onOpenAgentSettings}
        />
      </section>
    </AssistantRuntimeProvider>
  )
}
