import { Sparkles, Settings2 } from 'lucide-react'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'
import type { AssistantRecord } from '../../assistants/assistants-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Textarea } from '../../../components/ui/textarea'
import type { AssistantReadiness } from '../thread-page-helpers'
import type { ThreadRecord } from '../threads-query'
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
  onOpenAssistantConfig
}: ThreadChatCardProps): React.JSX.Element {
  const canCompose =
    Boolean(selectedAssistant && readiness.canChat) && !isChatStreaming && !isLoadingChatHistory

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-0 border-border/80 bg-card/78 py-0 rounded-none border-t-0">
      <CardHeader className="border-b border-border/70 py-2">
        <div className="flex h-full flex-nowrap items-center justify-between gap-3 overflow-hidden">
          <CardTitle className="min-w-0 flex-1 truncate text-base">
            {selectedThread?.title ?? `Chat with ${selectedAssistant?.name ?? 'Assistant'}`}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            <div className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs">
              <Sparkles className="size-3.5" />
              Default assistant chat
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              {selectedThread
                ? 'Messages stream from the selected assistant thread.'
                : selectedAssistant
                  ? 'No thread selected. Press Enter to create one and send.'
                  : 'Pick an assistant to begin.'}
            </p>
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
