import { Mic, Paperclip, Plus, Settings2, Sparkles } from 'lucide-react'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'
import type { AssistantRecord } from '../../assistants/assistants-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Textarea } from '../../../components/ui/textarea'
import type { AssistantReadiness } from '../thread-page-helpers'
import type { ThreadRecord } from '../threads-query'
import { getThreadDisplayTitle } from '../thread-page-routing'
import { ThreadChatMessageList } from './thread-chat-message-list'

type ThreadChatCardProps = {
  selectedAssistant: AssistantRecord | null
  selectedThread: ThreadRecord | null
  chat: UseChatHelpers<UIMessage>
  readiness: AssistantReadiness
  isLoadingChatHistory: boolean
  isChatStreaming: boolean
  chatError: unknown
  loadError: string | null
  composerValue: string
  canSendMessage: boolean
  canAbortGeneration: boolean
  onComposerChange: (value: string) => void
  onSubmitMessage: () => Promise<void>
  onAbortGeneration: () => void
  onOpenAssistantConfig: () => void
  onCreateThread: () => void
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
  composerValue,
  canSendMessage,
  canAbortGeneration,
  onComposerChange,
  onSubmitMessage,
  onAbortGeneration,
  onOpenAssistantConfig,
  onCreateThread
}: ThreadChatCardProps): React.JSX.Element {
  const canCompose =
    Boolean(selectedAssistant && readiness.canChat) && !isChatStreaming && !isLoadingChatHistory
  const statusChipLabel = selectedAssistant ? `${selectedAssistant.name} chat` : 'Assistant chat'

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-0 border-border/80 bg-card/78 py-0 rounded-none border-t-0">
      <CardHeader className="border-b border-border/70 py-2">
        <div className="flex h-full flex-nowrap items-center justify-between gap-3 overflow-hidden">
          <CardTitle className="min-w-0 flex-1 truncate text-base">
            {selectedThread
              ? getThreadDisplayTitle(selectedThread.title)
              : `Chat with ${selectedAssistant?.name ?? 'Assistant'}`}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            <div className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs">
              <Sparkles className="size-3.5" />
              {statusChipLabel}
            </div>
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

      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden py-5">
        {!readiness.canChat && selectedAssistant ? (
          <p className="text-muted-foreground mb-4 rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs">
            Assistant setup is incomplete. Open Configure to set workspace path, provider, and
            prompt before sending messages.
          </p>
        ) : null}

        <ThreadChatMessageList
          chat={chat}
          assistantName={selectedAssistant?.name ?? 'Assistant'}
          isLoadingChatHistory={isLoadingChatHistory}
          isChatStreaming={isChatStreaming}
          loadError={loadError}
          chatError={chatError}
        />
      </CardContent>

      <div className="border-t border-border/70 p-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmitMessage()
          }}
        >
          <Textarea
            rows={3}
            value={composerValue}
            onChange={(event) => {
              onComposerChange(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void onSubmitMessage()
              }
            }}
            disabled={!canCompose}
            placeholder={
              selectedThread
                ? 'Type a message for this thread...'
                : selectedAssistant
                  ? 'Type a message to create a new thread...'
                  : 'Select an assistant to start chatting.'
            }
            aria-label="Message composer"
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            {selectedAssistant ? (
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  aria-label="New thread"
                  onClick={onCreateThread}
                >
                  <Plus className="size-3.5" />
                  New thread
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  aria-label="Voice input"
                  disabled
                >
                  <Mic className="size-3.5" />
                  Voice input
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  aria-label="Attachments"
                  disabled
                >
                  <Paperclip className="size-3.5" />
                  Attachments
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">Pick an assistant to begin.</p>
            )}
            <Button
              type={isChatStreaming ? 'button' : 'submit'}
              disabled={isChatStreaming ? !canAbortGeneration : !canSendMessage}
              onClick={isChatStreaming ? onAbortGeneration : undefined}
            >
              {isChatStreaming ? 'Stop' : 'Send'}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  )
}
