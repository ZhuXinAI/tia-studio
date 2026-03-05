import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState
} from '@assistant-ui/react'
import { Copy, MoreHorizontal, RotateCw } from 'lucide-react'
import { createContext, useContext } from 'react'
import { toErrorMessage } from '../thread-page-routing'
import { Reasoning, ReasoningGroup } from '../../../components/assistant-ui/reasoning'
import { MarkdownText } from '../../../components/assistant-ui/markdown-text'
import { ToolFallback } from '../../../components/assistant-ui/tool-fallback'
import { ToolGroup } from '../../../components/assistant-ui/tool-group'
import { Button } from '../../../components/ui/button'

type ThreadChatMessageListProps = {
  assistantName: string
  isLoadingChatHistory: boolean
  isChatStreaming: boolean
  loadError: string | null
  chatError: unknown
}

const AssistantNameContext = createContext('Assistant')

function formatMessageTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const parsedDate = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsedDate.valueOf())) {
    return null
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function MessageTimestamp({ className }: { className?: string }): React.JSX.Element | null {
  const createdAt = useAuiState((state) => state.message.createdAt)
  const timestampLabel = formatMessageTimestamp(createdAt)

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

function UserMessageBubble(): React.JSX.Element {
  return (
    <MessagePrimitive.Root className="ml-auto max-w-2xl px-4 py-3">
      <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
        You
      </p>
      <MessagePrimitive.Parts
        components={{
          Text: UserTextPart
        }}
      />
      <MessageTimestamp className="mt-2 text-right" />
    </MessagePrimitive.Root>
  )
}

function AssistantMessageBubble(): React.JSX.Element {
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

        <ActionBarPrimitive.Root
          autohide="never"
          className="ml-auto flex items-center gap-1"
        >
          <ActionBarPrimitive.Copy asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Copy message"
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
              aria-label="Reload"
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
                aria-label="More actions"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </ActionBarMorePrimitive.Trigger>

            <ActionBarMorePrimitive.Content className="bg-card text-card-foreground border-border z-50 min-w-44 rounded-md border p-1 shadow-lg">
              <ActionBarPrimitive.ExportMarkdown asChild>
                <ActionBarMorePrimitive.Item className="data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:opacity-50">
                  Export Markdown
                </ActionBarMorePrimitive.Item>
              </ActionBarPrimitive.ExportMarkdown>
            </ActionBarMorePrimitive.Content>
          </ActionBarMorePrimitive.Root>
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  )
}

export function ThreadChatMessageList({
  assistantName,
  isLoadingChatHistory,
  isChatStreaming,
  loadError,
  chatError
}: ThreadChatMessageListProps): React.JSX.Element {
  return (
    <AssistantNameContext.Provider value={assistantName}>
      <ThreadPrimitive.Viewport className="chat-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <ThreadPrimitive.Empty>
          <p className="text-muted-foreground text-sm">No messages yet.</p>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage: UserMessageBubble,
            AssistantMessage: AssistantMessageBubble
          }}
        />

        {isLoadingChatHistory ? (
          <p role="status" className="text-muted-foreground text-xs">
            Loading thread history...
          </p>
        ) : null}

        {isChatStreaming ? (
          <p role="status" className="text-muted-foreground text-xs">
            Assistant is responding...
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
      </ThreadPrimitive.Viewport>
    </AssistantNameContext.Provider>
  )
}
