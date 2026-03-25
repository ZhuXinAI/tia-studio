import {
  Activity,
  AlertCircle,
  Clock3,
  ExternalLink,
  Link2,
  LoaderIcon,
  Plus,
  Settings2
} from 'lucide-react'
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
import type { AssistantRecord } from '../../assistants/assistants-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useTranslation } from '../../../i18n/use-app-translation'
import type { AssistantReadiness } from '../thread-page-helpers'
import type { ThreadRecord } from '../threads-query'
import { showBuiltInBrowserWindow } from '../built-in-browser-query'
import { ThreadChatMessageList } from './thread-chat-message-list'
import {
  ComposerAddAttachment,
  ComposerAttachments
} from '@renderer/components/assistant-ui/attachment'

type ThreadChatCardProps = {
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
  onOpenAssistantConfig: () => void
  onOpenHeartbeatMonitor: () => void
  onOpenCronMonitor: () => void
  onCreateThread: () => void
}

type ActiveBuiltInBrowserHandoff = {
  message: string | null
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
      className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-400/45 bg-amber-400/10 px-4 py-3"
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
        className="shrink-0"
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
> & { canCompose: boolean }

function ThreadChatComposer({
  selectedAssistant,
  selectedThread,
  readiness,
  isChatStreaming,
  canAbortGeneration,
  canCompose,
  supportsVision,
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
    <div className="border-t border-border/70 border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4 sm:p-5">
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
          className="placeholder:text-muted-foreground focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full rounded-[1.25rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-muted)] px-4 py-3 text-base shadow-none outline-none transition-[color,box-shadow,border-color,background-color] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:ring-[3px]"
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
  onOpenAssistantConfig,
  onOpenHeartbeatMonitor,
  onOpenCronMonitor,
  onCreateThread
}: ThreadChatCardProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const runtime = useAISDKRuntime(chat)

  const canCompose =
    Boolean(selectedAssistant && readiness.canChat) && !isChatStreaming && !isLoadingChatHistory
  const assistantName = selectedAssistant?.name ?? t('threads.chat.defaultAssistantName')
  const hasRemoteBinding = Boolean(selectedThread?.channelBinding?.remoteChatId)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerClearer
        selectedAssistantId={selectedAssistant?.id}
        selectedThreadId={selectedThread?.id}
      />
      <Card className="flex min-h-0 flex-1 flex-col gap-0 rounded-none border-t-0 border-transparent bg-[color:var(--surface-panel-strong)] py-0 shadow-none">
        <CardHeader
          className="border-b border-border/70 py-2 bg-[color:var(--surface-panel-soft)] sm:py-3"
          style={{ borderColor: 'var(--surface-border)' }}
        >
          <div className="flex h-full flex-nowrap items-center justify-between gap-3 overflow-hidden">
            <CardTitle className="min-w-0 flex-1 text-base tracking-[-0.015em]">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate">
                  {selectedThread?.title ??
                    t('threads.chat.titleWithAssistant', { name: assistantName })}
                </span>
                {hasRemoteBinding ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-200"
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
                  className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs"
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
                className="rounded-full"
                disabled={!selectedAssistant}
                onClick={onCreateThread}
              >
                <Plus className="size-4" />
                {t('threads.chat.newThread')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={!selectedAssistant}
                onClick={onOpenHeartbeatMonitor}
              >
                <Activity className="size-4" />
                {t('threads.chat.heartbeatButton')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={!selectedAssistant}
                onClick={onOpenCronMonitor}
              >
                <Clock3 className="size-4" />
                {t('threads.chat.cronButton')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={!selectedAssistant}
                onClick={onOpenAssistantConfig}
              >
                <Settings2 className="size-4" />
                {t('common.actions.configure')}
              </Button>
            </div>
          </div>
        </CardHeader>

        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden py-5">
            <BuiltInBrowserHandoffBanner />

            {!readiness.canChat && selectedAssistant ? (
              <p className="text-muted-foreground mb-4 rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs">
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
