import {
  AssistantRuntimeProvider,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive
} from '@assistant-ui/react'
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import type { UseChatHelpers } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { toErrorMessage } from '../thread-page-routing'

type ThreadChatMessageListProps = {
  chat: UseChatHelpers<UIMessage>
  assistantName: string
  isLoadingChatHistory: boolean
  isChatStreaming: boolean
  loadError: string | null
  chatError: unknown
}

function UserTextPart(): React.JSX.Element {
  return <MessagePartPrimitive.Text className="text-sm leading-relaxed whitespace-pre-wrap" />
}

function AssistantTextPart(): React.JSX.Element {
  return <MessagePartPrimitive.Text className="text-sm leading-relaxed whitespace-pre-wrap" />
}

function AssistantReasoningPart(): React.JSX.Element {
  return (
    <details className="mt-3 rounded-md border border-border/70 bg-muted/35 px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium tracking-wide uppercase">
        Reasoning
      </summary>
      <MessagePartPrimitive.Text className="text-muted-foreground mt-2 whitespace-pre-wrap text-xs leading-relaxed" />
    </details>
  )
}

function UserMessageBubble(): React.JSX.Element {
  return (
    <MessagePrimitive.Root className="bg-primary/12 border-primary/35 ml-auto max-w-2xl rounded-xl border px-4 py-3 shadow-sm">
      <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
        You
      </p>
      <MessagePrimitive.Parts
        components={{
          Text: UserTextPart
        }}
      />
    </MessagePrimitive.Root>
  )
}

function AssistantMessageBubble({ assistantName }: { assistantName: string }): React.JSX.Element {
  return (
    <MessagePrimitive.Root className="mr-10 max-w-3xl rounded-xl border border-border/70 bg-background/55 px-4 py-3 shadow-sm">
      <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
        {assistantName}
      </p>
      <MessagePrimitive.Parts
        components={{
          Text: AssistantTextPart,
          Reasoning: AssistantReasoningPart
        }}
      />
    </MessagePrimitive.Root>
  )
}

export function ThreadChatMessageList({
  chat,
  assistantName,
  isLoadingChatHistory,
  isChatStreaming,
  loadError,
  chatError
}: ThreadChatMessageListProps): React.JSX.Element {
  const runtime = useAISDKRuntime(chat)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <ThreadPrimitive.Empty>
            <p className="text-muted-foreground text-sm">No messages yet.</p>
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages
            components={{
              UserMessage: UserMessageBubble,
              AssistantMessage: () => <AssistantMessageBubble assistantName={assistantName} />
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
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}
