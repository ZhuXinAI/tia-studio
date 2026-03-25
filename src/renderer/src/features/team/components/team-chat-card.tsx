import { Plus, Settings2, Users } from 'lucide-react'
import type { UIMessage } from 'ai'
import type { UseChatHelpers } from '@ai-sdk/react'
import { AssistantRuntimeProvider, ThreadPrimitive } from '@assistant-ui/react'
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import { useEffect, useState } from 'react'
import { Mention, MentionsInput, type MentionsInputStyle } from 'react-mentions'
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

const composerStyle: MentionsInputStyle = {
  control: {
    fontSize: 14,
    fontWeight: 400
  },
  '&multiLine': {
    control: {
      minHeight: 88
    },
    highlighter: {
      padding: '12px 16px',
      border: '1px solid transparent',
      lineHeight: '1.5rem',
      whiteSpace: 'pre-wrap',
      overflow: 'hidden'
    },
    input: {
      width: '100%',
      minHeight: 96,
      margin: 0,
      border: '1px solid var(--surface-border)',
      borderRadius: '1.25rem',
      backgroundColor: 'var(--surface-muted)',
      color: 'inherit',
      padding: '12px 16px',
      outline: 'none',
      lineHeight: '1.5rem',
      boxShadow: 'none',
      overflow: 'auto'
    }
  },
  suggestions: {
    background: 'transparent',
    list: {
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--surface-border-strong)',
      borderRadius: '1rem',
      boxShadow: '0 24px 50px -28px rgb(15 23 42 / 0.55)',
      marginTop: 8,
      overflow: 'hidden',
      position: 'relative',
      zIndex: 20
    },
    item: {
      padding: '8px 12px',
      backgroundColor: 'var(--popover)',
      color: 'var(--popover-foreground)',
      '&focused': {
        backgroundColor: 'var(--accent)',
        color: 'var(--accent-foreground)'
      }
    }
  }
}

function TeamChatComposer({
  selectedWorkspace,
  selectedThread,
  selectedMembers,
  readiness,
  isChatStreaming,
  canAbortGeneration,
  canCompose,
  onSubmitMessage,
  onAbortGeneration,
  onOpenStatusDialog
}: Pick<
  TeamChatCardProps,
  | 'selectedWorkspace'
  | 'selectedThread'
  | 'selectedMembers'
  | 'readiness'
  | 'isChatStreaming'
  | 'canAbortGeneration'
  | 'onSubmitMessage'
  | 'onAbortGeneration'
  | 'onOpenStatusDialog'
> & { canCompose: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const [draftValue, setDraftValue] = useState('')
  const [draftPlainTextValue, setDraftPlainTextValue] = useState('')
  const mentionSuggestions = selectedMembers.map((member) => ({
    id: member.id,
    display: member.name
  }))

  useEffect(() => {
    setDraftValue('')
    setDraftPlainTextValue('')
  }, [selectedThread?.id])

  const canSendMessage =
    Boolean(selectedWorkspace && readiness.canChat) &&
    draftPlainTextValue.trim().length > 0 &&
    !isChatStreaming &&
    canCompose

  return (
    <div className="border-t border-border/70 border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4 sm:p-5">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault()
          const text = draftPlainTextValue.trim()
          if (text.length === 0) {
            return
          }

          await onSubmitMessage(text)
          setDraftValue('')
          setDraftPlainTextValue('')
        }}
      >
        <MentionsInput
          value={draftValue}
          onChange={(_event, nextValue, nextPlainTextValue) => {
            setDraftValue(nextValue)
            setDraftPlainTextValue(nextPlainTextValue)
          }}
          rows={3}
          disabled={!canCompose || !readiness.canChat}
          placeholder={
            selectedThread || canCompose
              ? t('team.chat.composer.placeholderSelected')
              : t('team.chat.composer.placeholderEmpty')
          }
          aria-label={t('team.chat.composer.ariaLabel')}
          a11ySuggestionsListLabel={t('team.chat.composer.ariaLabel')}
          allowSuggestionsAboveCursor
          style={composerStyle}
          className="team-chat-mentions text-base md:text-sm"
        >
          <Mention
            trigger="@"
            data={mentionSuggestions}
            markup="@[__display__](__id__)"
            appendSpaceOnAdd
            displayTransform={(_id, display) => `@${display}`}
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent) 72%, transparent)',
              color: 'inherit'
            }}
          />
        </MentionsInput>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            {selectedThread || canCompose
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
              <Button type="submit" disabled={!canSendMessage}>
                {t('common.actions.send')}
              </Button>
            )}
          </div>
        </div>
      </form>
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

  const canCompose = Boolean(selectedWorkspace && readiness.canChat) && !isLoadingChatHistory

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Card className="flex h-full min-h-0 flex-col gap-0 border-0 bg-[color:var(--surface-panel-strong)] shadow-none">
        <CardHeader className="border-b border-border/70 border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-base tracking-[-0.015em]">
                {selectedThread?.title || t('team.chat.defaultTitle')}
              </CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="text-muted-foreground inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs">
                  <Users className="size-3.5" />
                  {selectedWorkspace?.name ?? t('team.chat.noWorkspaceSelected')}
                </div>
                <div className="text-muted-foreground inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs">
                  {t('team.chat.membersLabel', { count: selectedMembers.length })}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={onCreateThread}
              >
                <Plus className="size-4" />
                {t('team.chat.newThread')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
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
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-[1.25rem] border border-dashed border-border/70 border-[color:var(--surface-border)] bg-[color:var(--surface-muted)] p-6 text-center">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('team.chat.emptyTitle')}</p>
                  <p className="text-muted-foreground text-sm">{t('team.chat.emptyDescription')}</p>
                </div>
              </div>
            ) : (
              <ThreadChatMessageList
                key={selectedThread.id}
                threadId={selectedThread.id}
                assistantName={t('team.chat.supervisorName')}
                assistantMessageVariant="team"
                isLoadingChatHistory={isLoadingChatHistory}
                isChatStreaming={isChatStreaming}
                loadError={loadError}
                chatError={chatError}
              />
            )}
          </CardContent>

          <TeamChatComposer
            selectedWorkspace={selectedWorkspace}
            selectedThread={selectedThread}
            selectedMembers={selectedMembers}
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
