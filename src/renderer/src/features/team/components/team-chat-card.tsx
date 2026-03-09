import { Plus, Settings2, Users } from 'lucide-react'
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
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useTranslation } from '../../../i18n/use-app-translation'
import { ThreadChatMessageList } from '../../threads/components/thread-chat-message-list'
import type { AssistantRecord } from '../../assistants/assistants-query'
import type { TeamThreadRecord } from '../team-threads-query'
import type { TeamWorkspaceRecord } from '../team-workspaces-query'
import type { TeamReadiness } from '../hooks/use-team-page-controller'

type TeamChatCardProps = {
  selectedWorkspace: TeamWorkspaceRecord | null
  selectedThread: TeamThreadRecord | null
  selectedMembers: AssistantRecord[]
  chat: UseChatHelpers<UIMessage>
  readiness: TeamReadiness
  isLoadingChatHistory: boolean
  isChatStreaming: boolean
  chatError: unknown
  loadError: string | null
  canAbortGeneration: boolean
  onSubmitMessage: (messageText: string) => Promise<void>
  onAbortGeneration: () => void
  onOpenStatusDialog: () => void
  onOpenTeamConfig: () => void
  onCreateThread: () => void
}

function ComposerClearer({ selectedThreadId }: { selectedThreadId: string | undefined }): null {
  const aui = useAui()

  useEffect(() => {
    aui.composer().setText('')
  }, [aui, selectedThreadId])

  return null
}

function TeamChatComposer({
  selectedThread,
  readiness,
  isChatStreaming,
  canAbortGeneration,
  canCompose,
  onSubmitMessage,
  onAbortGeneration,
  onOpenStatusDialog
}: Pick<
  TeamChatCardProps,
  | 'selectedThread'
  | 'readiness'
  | 'isChatStreaming'
  | 'canAbortGeneration'
  | 'onSubmitMessage'
  | 'onAbortGeneration'
  | 'onOpenStatusDialog'
> & { canCompose: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const aui = useAui()
  const composerText = useAuiState((state) => (state.composer.isEditing ? state.composer.text : ''))

  const canSendMessage =
    Boolean(selectedThread && readiness.canChat) &&
    composerText.trim().length > 0 &&
    !isChatStreaming &&
    canCompose

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

          aui.composer().setText('')
          await onSubmitMessage(text)
        }}
      >
        <ComposerPrimitive.Input
          minRows={3}
          disabled={!canCompose || !readiness.canChat}
          placeholder={
            selectedThread
              ? t('team.chat.composer.placeholderSelected')
              : t('team.chat.composer.placeholderEmpty')
          }
          aria-label={t('team.chat.composer.ariaLabel')}
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:ring-[3px]"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            {selectedThread
              ? t('team.chat.composer.helperSelected')
              : t('team.chat.composer.helperEmpty')}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onOpenStatusDialog}>
              {t('team.chat.composer.openStatus')}
            </Button>
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

export function TeamChatCard({
  selectedWorkspace,
  selectedThread,
  selectedMembers,
  chat,
  readiness,
  isLoadingChatHistory,
  isChatStreaming,
  chatError,
  loadError,
  canAbortGeneration,
  onSubmitMessage,
  onAbortGeneration,
  onOpenStatusDialog,
  onOpenTeamConfig,
  onCreateThread
}: TeamChatCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const runtime = useAISDKRuntime(chat)

  const canCompose = Boolean(selectedThread && readiness.canChat) && !isLoadingChatHistory

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerClearer selectedThreadId={selectedThread?.id} />
      <Card className="flex h-full min-h-0 flex-col gap-0 border-border/80 bg-card/78">
        <CardHeader className="border-b border-border/70 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-base">
                {selectedThread?.title || t('team.chat.defaultTitle')}
              </CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs">
                  <Users className="size-3.5" />
                  {selectedWorkspace?.name ?? t('team.chat.noWorkspaceSelected')}
                </div>
                <div className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs">
                  {t('team.chat.membersLabel', { count: selectedMembers.length })}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onCreateThread}>
                <Plus className="size-4" />
                {t('team.chat.newThread')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedWorkspace}
                onClick={onOpenTeamConfig}
              >
                <Settings2 className="size-4" />
                {t('team.chat.configureTeam')}
              </Button>
            </div>
          </div>
        </CardHeader>

        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden py-5">
            {!readiness.canChat && selectedThread ? (
              <div className="mb-4 rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {t('team.chat.setupIncompleteTitle')}
                </p>
                <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                  {t('team.chat.setupIncompleteDescription')}
                </p>
              </div>
            ) : null}

            {!selectedThread ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-center">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('team.chat.emptyTitle')}</p>
                  <p className="text-muted-foreground text-sm">
                    {t('team.chat.emptyDescription')}
                  </p>
                </div>
              </div>
            ) : (
              <ThreadChatMessageList
                assistantName={t('team.chat.supervisorName')}
                isLoadingChatHistory={isLoadingChatHistory}
                isChatStreaming={isChatStreaming}
                loadError={loadError}
                chatError={chatError}
              />
            )}
          </CardContent>

          <TeamChatComposer
            selectedThread={selectedThread}
            readiness={readiness}
            isChatStreaming={isChatStreaming}
            canAbortGeneration={canAbortGeneration}
            canCompose={canCompose}
            onSubmitMessage={onSubmitMessage}
            onAbortGeneration={onAbortGeneration}
            onOpenStatusDialog={onOpenStatusDialog}
          />
        </ThreadPrimitive.Root>
      </Card>
    </AssistantRuntimeProvider>
  )
}
