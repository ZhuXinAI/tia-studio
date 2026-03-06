import { Plus, Sparkles, Settings2 } from 'lucide-react'
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
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import type { AssistantReadiness } from '../thread-page-helpers'
import type { ThreadRecord } from '../threads-query'
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
  tokenUsage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  } | null
  onSubmitMessage: (messageText: string) => Promise<void>
  onAbortGeneration: () => void
  onOpenAssistantConfig: () => void
  onCreateThread: () => void
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
  const aui = useAui()
  const composerText = useAuiState((state) => (state.composer.isEditing ? state.composer.text : ''))

  const canSendMessage =
    Boolean(selectedAssistant && readiness.canChat) &&
    composerText.trim().length > 0 &&
    !isChatStreaming &&
    canCompose

  const placeholder = selectedThread
    ? 'Type a message for this thread...'
    : selectedAssistant
      ? 'Type a message to create a new thread...'
      : 'Select an assistant to start chatting.'

  const helperText = selectedThread
    ? 'Messages stream from the selected assistant thread.'
    : selectedAssistant
      ? 'No thread selected. Press Enter to create one and send.'
      : 'Pick an assistant to begin.'

  return (
    <div className="border-t border-border/70 p-4">
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
          aria-label="Message composer"
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:ring-[3px]"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">{helperText}</p>
          <div className="flex items-center gap-2">
            {supportsVision && <ComposerAddAttachment />}

            {isChatStreaming ? (
              <Button type="button" disabled={!canAbortGeneration} onClick={onAbortGeneration}>
                Stop
              </Button>
            ) : (
              <ComposerPrimitive.Send asChild>
                <Button type="submit" disabled={!canSendMessage}>
                  Send
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
  onCreateThread
}: ThreadChatCardProps): React.JSX.Element {
  const runtime = useAISDKRuntime(chat)

  const canCompose =
    Boolean(selectedAssistant && readiness.canChat) && !isChatStreaming && !isLoadingChatHistory

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerClearer
        selectedAssistantId={selectedAssistant?.id}
        selectedThreadId={selectedThread?.id}
      />
      <Card className="flex min-h-0 flex-1 flex-col gap-0 border-border/80 bg-card/78 py-0 rounded-none border-t-0">
        <CardHeader className="border-b border-border/70 py-2">
          <div className="flex h-full flex-nowrap items-center justify-between gap-3 overflow-hidden">
            <CardTitle className="min-w-0 flex-1 truncate text-base">
              {selectedThread?.title ?? `Chat with ${selectedAssistant?.name ?? 'Assistant'}`}
            </CardTitle>
            <div className="flex shrink-0 items-center gap-2">
              {tokenUsage && (
                <div className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs">
                  <span className="font-medium">{tokenUsage.totalTokens.toLocaleString()}</span>
                  <span className="text-muted-foreground/70">tokens</span>
                  <span className="text-muted-foreground/50">•</span>
                  <span className="text-muted-foreground/70">
                    {tokenUsage.inputTokens.toLocaleString()} in
                  </span>
                  <span className="text-muted-foreground/50">•</span>
                  <span className="text-muted-foreground/70">
                    {tokenUsage.outputTokens.toLocaleString()} out
                  </span>
                </div>
              )}
              <div className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs">
                <Sparkles className="size-3.5" />
                Default assistant chat
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedAssistant}
                onClick={onCreateThread}
              >
                <Plus className="size-4" />
                New thread
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedAssistant}
                onClick={onOpenAssistantConfig}
              >
                <Settings2 className="size-4" />
                Configure
              </Button>
            </div>
          </div>
        </CardHeader>

        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden py-5">
            {!readiness.canChat && selectedAssistant ? (
              <p className="text-muted-foreground mb-4 rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs">
                Assistant setup is incomplete. Open Configure to set provider and model before
                sending messages.
              </p>
            ) : null}

            <ThreadChatMessageList
              assistantName={selectedAssistant?.name ?? 'Assistant'}
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
