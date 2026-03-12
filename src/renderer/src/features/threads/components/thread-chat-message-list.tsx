import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useMessagePartFile
} from '@assistant-ui/react'
import { Virtuoso, type IndexLocationWithAlign } from 'react-virtuoso'
import { Copy, File, MoreHorizontal, RotateCw } from 'lucide-react'
import { createContext, useContext, useMemo } from 'react'
import { toErrorMessage } from '../thread-page-routing'
import { Reasoning, ReasoningGroup } from '../../../components/assistant-ui/reasoning'
import { MarkdownText } from '../../../components/assistant-ui/markdown-text'
import { ToolFallback } from '../../../components/assistant-ui/tool-fallback'
import { ToolGroup } from '../../../components/assistant-ui/tool-group'
import { Button } from '../../../components/ui/button'
import { Image } from '@renderer/components/assistant-ui/image'
import { UserMessageAttachments } from '@renderer/components/assistant-ui/attachment'
import { useTranslation } from '../../../i18n/use-app-translation'

type ThreadChatMessageListProps = {
  threadId: string | null
  assistantName: string
  isLoadingChatHistory: boolean
  isChatStreaming: boolean
  loadError: string | null
  chatError: unknown
}

const AssistantNameContext = createContext('Assistant')
const ESTIMATED_MESSAGE_HEIGHT = 160

function formatMessageTimestamp(
  value: Date | string | null | undefined,
  locale: string | undefined
): string | null {
  if (!value) {
    return null
  }

  const parsedDate = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsedDate.valueOf())) {
    return null
  }

  return parsedDate.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function MessageTimestamp({ className }: { className?: string }): React.JSX.Element | null {
  const { i18n } = useTranslation()
  const createdAt = useAuiState((state) => state.message.createdAt)
  const timestampLabel = formatMessageTimestamp(createdAt, i18n.resolvedLanguage)

  if (!timestampLabel) {
    return null
  }

  return (
    <p
      data-testid="message-timestamp"
      className={
        className
          ? `text-muted-foreground text-[11px] ${className}`
          : `text-muted-foreground text-[11px]`
      }
    >
      {timestampLabel}
    </p>
  )
}

function UserTextPart(): React.JSX.Element {
  return <MessagePartPrimitive.Text className="text-sm leading-relaxed whitespace-pre-wrap" />
}

function UserFileAttachment(): React.JSX.Element {
  const { t } = useTranslation()
  const file = useMessagePartFile()

  return (
    <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2">
      <File className="size-4 text-muted-foreground" />
      <span className="text-sm">{file.filename || t('threads.messageList.untitledFile')}</span>
      {file.mimeType && <span className="text-muted-foreground text-xs">({file.mimeType})</span>}
    </div>
  )
}

function UserMessageBubble(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <MessagePrimitive.Root className="ml-auto max-w-2xl px-4 py-3">
      <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
        {t('threads.messageList.you')}
      </p>

      <UserMessageAttachments />

      <MessagePrimitive.Parts
        components={{
          Text: UserTextPart,
          Image: Image,
          File: UserFileAttachment
        }}
      />
      <MessageTimestamp className="mt-2 text-right" />
    </MessagePrimitive.Root>
  )
}

function AssistantMessageBubble(): React.JSX.Element {
  const { t } = useTranslation()
  const assistantName = useContext(AssistantNameContext)

  return (
    <MessagePrimitive.Root className="max-w-3xl px-4 py-3">
      <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
        {assistantName}
      </p>
      <MessagePrimitive.Parts
        components={{
          Reasoning: Reasoning,
          ReasoningGroup: ReasoningGroup,
          Text: MarkdownText,
          tools: {
            Fallback: ToolFallback
          },
          ToolGroup: ToolGroup
        }}
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <MessageTimestamp />

        <ActionBarPrimitive.Root autohide="never" className="ml-auto flex items-center gap-1">
          <ActionBarPrimitive.Copy asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('threads.messageList.copyMessage')}
            >
              <Copy className="size-3.5" />
            </Button>
          </ActionBarPrimitive.Copy>
          <ActionBarPrimitive.Reload asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('threads.messageList.reloadMessage')}
            >
              <RotateCw className="size-3.5" />
            </Button>
          </ActionBarPrimitive.Reload>

          <ActionBarMorePrimitive.Root>
            <ActionBarMorePrimitive.Trigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('threads.messageList.moreActions')}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </ActionBarMorePrimitive.Trigger>

            <ActionBarMorePrimitive.Content className="bg-card text-card-foreground border-border z-50 min-w-44 rounded-md border p-1 shadow-lg">
              <ActionBarPrimitive.ExportMarkdown asChild>
                <ActionBarMorePrimitive.Item className="data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:opacity-50">
                  {t('threads.messageList.exportMarkdown')}
                </ActionBarMorePrimitive.Item>
              </ActionBarPrimitive.ExportMarkdown>
            </ActionBarMorePrimitive.Content>
          </ActionBarMorePrimitive.Root>
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  )
}

function ThreadChatStatus({
  isLoadingChatHistory,
  isChatStreaming,
  loadError,
  chatError
}: Pick<
  ThreadChatMessageListProps,
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
          {toErrorMessage(chatError)}
        </p>
      ) : null}

      {loadError ? (
        <p
          role="alert"
          className="text-destructive rounded-md border border-destructive/60 px-3 py-2 text-sm"
        >
          {loadError}
        </p>
      ) : null}
    </>
  )
}

export function ThreadChatMessageList({
  threadId,
  assistantName,
  isLoadingChatHistory,
  isChatStreaming,
  loadError,
  chatError
}: ThreadChatMessageListProps): React.JSX.Element {
  const { t } = useTranslation()
  const messages = useAuiState((state) => state.thread.messages)
  const messageCount = messages.length
  const hasMessages = messageCount > 0
  const shouldRenderVirtualList = hasMessages || !isLoadingChatHistory
  const renderState = hasMessages ? 'data' : 'empty'
  const initialTopMostItemIndex = useMemo<IndexLocationWithAlign | undefined>(() => {
    if (!hasMessages) {
      return undefined
    }

    return {
      index: 'LAST',
      align: 'end'
    }
  }, [hasMessages])
  const messageComponents = useMemo(
    () => ({
      UserMessage: UserMessageBubble,
      AssistantMessage: AssistantMessageBubble
    }),
    []
  )

  if (!shouldRenderVirtualList) {
    return (
      <AssistantNameContext.Provider value={assistantName}>
        <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          <ThreadChatStatus
            isLoadingChatHistory={isLoadingChatHistory}
            isChatStreaming={isChatStreaming}
            loadError={loadError}
            chatError={chatError}
          />
        </div>
      </AssistantNameContext.Provider>
    )
  }

  function EmptyPlaceholder(): React.JSX.Element {
    return <p className="text-muted-foreground text-sm">{t('threads.messageList.empty')}</p>
  }

  function Footer(): React.JSX.Element {
    return (
      <div className="space-y-3 pt-3">
        <ThreadChatStatus
          isLoadingChatHistory={isLoadingChatHistory}
          isChatStreaming={isChatStreaming}
          loadError={loadError}
          chatError={chatError}
        />
      </div>
    )
  }

  return (
    <AssistantNameContext.Provider value={assistantName}>
      <Virtuoso
        key={`${threadId ?? 'thread'}:${renderState}`}
        className="chat-scrollbar min-h-0 flex-1 pr-1"
        style={{ height: '100%', overflowAnchor: 'none' }}
        data={messages}
        defaultItemHeight={ESTIMATED_MESSAGE_HEIGHT}
        alignToBottom
        atBottomThreshold={24}
        followOutput={(isAtBottom) => (isAtBottom ? 'auto' : false)}
        increaseViewportBy={{ top: 0, bottom: 240 }}
        minOverscanItemCount={{ top: 4, bottom: 8 }}
        initialTopMostItemIndex={initialTopMostItemIndex}
        computeItemKey={(index, message) => message.id ?? `${threadId ?? 'thread'}:${index}`}
        components={{
          EmptyPlaceholder,
          Footer
        }}
        itemContent={(index) => (
          <div className="flex pb-3">
            <ThreadPrimitive.MessageByIndex index={index} components={messageComponents} />
          </div>
        )}
      />
    </AssistantNameContext.Provider>
  )
}
