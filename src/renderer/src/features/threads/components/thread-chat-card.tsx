import { Mic, Plus, Sparkles, Square, Settings2, Paperclip, X } from 'lucide-react'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
  WebSpeechDictationAdapter
} from '@assistant-ui/react'
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssistantRecord } from '../../assistants/assistants-query'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
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
  supportsVision: boolean
  tokenUsage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  } | null
  onComposerChange: (value: string) => void
  onSubmitMessage: () => Promise<void>
  onAbortGeneration: () => void
  onOpenAssistantConfig: () => void
  onCreateThread: () => void
}

function AttachmentPreview({ file }: { file: File }): React.JSX.Element {
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }, [file])

  if (!preview) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-md border border-border/70 bg-muted">
        <span className="text-muted-foreground text-xs">Loading...</span>
      </div>
    )
  }

  return (
    <img
      src={preview}
      alt={file.name}
      className="h-20 w-20 rounded-md border border-border/70 object-cover"
    />
  )
}

type ThreadChatComposerProps = Pick<
  ThreadChatCardProps,
  | 'selectedAssistant'
  | 'selectedThread'
  | 'readiness'
  | 'isChatStreaming'
  | 'composerValue'
  | 'canSendMessage'
  | 'canAbortGeneration'
  | 'supportsVision'
  | 'onComposerChange'
  | 'onSubmitMessage'
  | 'onAbortGeneration'
> & { canCompose: boolean }

function ThreadChatComposer({
  selectedAssistant,
  selectedThread,
  readiness,
  isChatStreaming,
  composerValue,
  canSendMessage,
  canAbortGeneration,
  canCompose,
  supportsVision,
  onComposerChange,
  onSubmitMessage,
  onAbortGeneration
}: ThreadChatComposerProps): React.JSX.Element {
  const aui = useAui()
  const composerText = useAuiState((state) => (state.composer.isEditing ? state.composer.text : ''))
  const lastSyncedTextRef = useRef(composerText)
  const dictationTranscript = useAuiState((state) => state.composer.dictation?.transcript)
  const isDictating = useAuiState((state) => state.composer.dictation != null)
  const attachments = useAuiState((state) => state.composer.attachments)

  useEffect(() => {
    const lastSynced = lastSyncedTextRef.current

    if (composerText === composerValue) {
      lastSyncedTextRef.current = composerText
      return
    }

    if (composerValue === lastSynced && composerText !== lastSynced) {
      onComposerChange(composerText)
      lastSyncedTextRef.current = composerText
      return
    }

    if (composerText === lastSynced && composerValue !== lastSynced) {
      aui.composer().setText(composerValue)
      lastSyncedTextRef.current = composerValue
      return
    }

    onComposerChange(composerText)
    lastSyncedTextRef.current = composerText
  }, [aui, composerText, composerValue, onComposerChange])

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
        onSubmit={(event) => {
          console.log('[Form submit] Attachments:', attachments)
          // Let the runtime handle the submission with attachments
          // But we still need custom logic for thread creation
          if (!selectedThread) {
            event.preventDefault()
            void onSubmitMessage()
          }
          // If thread exists, let runtime handle it naturally
        }}
      >
        {dictationTranscript ? (
          <div className="bg-muted/30 text-muted-foreground rounded-md border border-border/70 px-3 py-2 text-xs">
            <ComposerPrimitive.DictationTranscript />
          </div>
        ) : null}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2 bg-muted/20 rounded-md border border-border">
            {attachments.map((attachment, index) => {
              console.log('[Manual render] Attachment:', attachment, 'Index:', index)
              return (
                <div key={attachment.id} className="relative inline-block">
                  {attachment.file && <AttachmentPreview file={attachment.file} />}
                  <button
                    type="button"
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90"
                    aria-label="Remove attachment"
                    onClick={() => {
                      aui.composer().attachment({ index }).remove()
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <ComposerPrimitive.Input
          minRows={3}
          disabled={!canCompose || !readiness.canChat}
          placeholder={placeholder}
          aria-label="Message composer"
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:ring-[3px]"
          onChange={(event) => {
            onComposerChange(event.target.value)
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">{helperText}</p>
          <div className="flex items-center gap-2">
            {supportsVision && (
              <ComposerPrimitive.AddAttachment asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Add attachment"
                  disabled={!canCompose}
                >
                  <Paperclip className="size-4" />
                </Button>
              </ComposerPrimitive.AddAttachment>
            )}

            {isDictating ? (
              <ComposerPrimitive.StopDictation asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Stop dictation"
                  disabled={!canCompose}
                >
                  <Square className="size-4" />
                </Button>
              </ComposerPrimitive.StopDictation>
            ) : (
              <ComposerPrimitive.Dictate asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Start dictation"
                  disabled={!canCompose}
                >
                  <Mic className="size-4" />
                </Button>
              </ComposerPrimitive.Dictate>
            )}

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
  composerValue,
  canSendMessage,
  canAbortGeneration,
  supportsVision,
  tokenUsage,
  onComposerChange,
  onSubmitMessage,
  onAbortGeneration,
  onOpenAssistantConfig,
  onCreateThread
}: ThreadChatCardProps): React.JSX.Element {
  const dictationAdapter = useMemo(() => {
    if (!WebSpeechDictationAdapter.isSupported()) {
      return null
    }

    return new WebSpeechDictationAdapter()
  }, [])

  const runtime = useAISDKRuntime(chat, {
    adapters: dictationAdapter ? { dictation: dictationAdapter } : undefined
  })
  const canCompose =
    Boolean(selectedAssistant && readiness.canChat) && !isChatStreaming && !isLoadingChatHistory

  return (
    <AssistantRuntimeProvider runtime={runtime}>
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
                Assistant setup is incomplete. Open Configure to set workspace path, provider, and
                prompt before sending messages.
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
            composerValue={composerValue}
            canSendMessage={canSendMessage}
            canAbortGeneration={canAbortGeneration}
            canCompose={canCompose}
            supportsVision={supportsVision}
            onComposerChange={onComposerChange}
            onSubmitMessage={onSubmitMessage}
            onAbortGeneration={onAbortGeneration}
          />
        </ThreadPrimitive.Root>
      </Card>
    </AssistantRuntimeProvider>
  )
}
