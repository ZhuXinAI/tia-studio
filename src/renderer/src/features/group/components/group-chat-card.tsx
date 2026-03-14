import { Settings2, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { Mention, MentionsInput, type MentionsInputStyle } from 'react-mentions'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useTranslation } from '../../../i18n/use-app-translation'
import type { AssistantRecord } from '../../assistants/assistants-query'
import {
  buildGroupMentionSuggestions,
  extractUniqueMentionIds
} from '../group-mentions'
import type { GroupRoomMessageRecord } from '../group-chat-query'
import type { GroupThreadRecord } from '../group-threads-query'
import type { GroupRecord } from '../group-groups-query'
import type { GroupReadiness } from '../hooks/use-group-page-controller'
import { GroupMessageList } from './group-message-list'

type GroupChatCardProps = {
  selectedGroup: GroupRecord | null
  selectedThread: GroupThreadRecord | null
  messages: GroupRoomMessageRecord[]
  members: AssistantRecord[]
  readiness: GroupReadiness
  isLoadingMessages: boolean
  isSubmittingMessage: boolean
  isAgentTyping: boolean
  activeSpeakerName: string | null
  loadError: string | null
  onSubmitMessage: (input: { messageText: string; mentions: string[] }) => Promise<void>
  onOpenConfig: () => void
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
      padding: '8px 12px',
      border: '1px solid transparent',
      lineHeight: '1.5rem',
      whiteSpace: 'pre-wrap',
      overflow: 'hidden'
    },
    input: {
      width: '100%',
      minHeight: 88,
      margin: 0,
      border: '1px solid var(--input)',
      borderRadius: 'calc(var(--radius) - 2px)',
      backgroundColor: 'transparent',
      color: 'inherit',
      padding: '8px 12px',
      outline: 'none',
      lineHeight: '1.5rem',
      boxShadow: 'var(--shadow-xs)',
      overflow: 'auto'
    }
  },
  suggestions: {
    background: 'transparent',
    list: {
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--border)',
      borderRadius: 'calc(var(--radius) - 2px)',
      boxShadow:
        '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
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

export function GroupChatCard({
  selectedGroup,
  selectedThread,
  messages,
  members,
  readiness,
  isLoadingMessages,
  isSubmittingMessage,
  isAgentTyping,
  activeSpeakerName,
  loadError,
  onSubmitMessage,
  onOpenConfig,
  onCreateThread
}: GroupChatCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const [draftValue, setDraftValue] = useState('')
  const [draftPlainTextValue, setDraftPlainTextValue] = useState('')
  const [draftMentions, setDraftMentions] = useState<string[]>([])

  const canCompose = Boolean(selectedThread && readiness.canChat) && !isSubmittingMessage
  const canSendMessage = canCompose && draftPlainTextValue.trim().length > 0
  const mentionSuggestions = buildGroupMentionSuggestions(members)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const nextDraft = draftPlainTextValue.trim()
    if (nextDraft.length === 0) {
      return
    }

    await onSubmitMessage({
      messageText: nextDraft,
      mentions: draftMentions
    })
    setDraftValue('')
    setDraftPlainTextValue('')
    setDraftMentions([])
  }

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 border-border/80 bg-card/78">
      <CardHeader className="border-b border-border/70 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              {selectedThread?.title || t('group.chat.defaultTitle')}
            </CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs">
                <Users className="size-3.5" />
                {selectedGroup?.name ?? t('group.chat.noWorkspaceSelected')}
              </div>
              <div className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs">
                {t('group.chat.membersLabel', { count: members.length })}
              </div>
              {selectedGroup ? (
                <div className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs">
                  <Sparkles className="size-3.5" />
                  {t('group.chat.maxTurnsLabel', { count: selectedGroup.maxAutoTurns })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCreateThread}>
              {t('group.chat.newThread')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedGroup}
              onClick={onOpenConfig}
            >
              <Settings2 className="size-4" />
              {t('group.chat.configureGroup')}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden py-5">
        {!readiness.canChat && selectedThread ? (
          <div className="mb-4 rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              {t('group.chat.setupIncompleteTitle')}
            </p>
            <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
              {t('group.chat.setupIncompleteDescription')}
            </p>
          </div>
        ) : null}

        {!selectedThread ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-center">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('group.chat.emptyTitle')}</p>
              <p className="text-muted-foreground text-sm">{t('group.chat.emptyDescription')}</p>
            </div>
          </div>
        ) : (
          <>
            <GroupMessageList
              messages={messages}
              isLoadingMessages={isLoadingMessages}
              loadError={loadError}
            />
            {isAgentTyping && activeSpeakerName ? (
              <p className="text-muted-foreground mt-3 text-xs">
                {t('group.chat.thinking', { name: activeSpeakerName })}
              </p>
            ) : null}
          </>
        )}
      </CardContent>

      <div className="border-t border-border/70 p-4">
        <form className="space-y-3" onSubmit={handleSubmit}>
          <MentionsInput
            value={draftValue}
            onChange={(_event, nextValue, nextPlainTextValue, mentions) => {
              setDraftValue(nextValue)
              setDraftPlainTextValue(nextPlainTextValue)
              setDraftMentions(extractUniqueMentionIds(mentions))
            }}
            rows={3}
            disabled={!canCompose}
            placeholder={
              selectedThread
                ? t('group.chat.composer.placeholderSelected')
                : t('group.chat.composer.placeholderEmpty')
            }
            aria-label={t('group.chat.composer.ariaLabel')}
            a11ySuggestionsListLabel={t('group.chat.composer.ariaLabel')}
            allowSuggestionsAboveCursor
            style={composerStyle}
            className="text-base md:text-sm"
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
              {selectedThread
                ? t('group.chat.composer.helperSelected')
                : t('group.chat.composer.helperEmpty')}
            </p>
            <Button type="submit" disabled={!canSendMessage}>
              {isSubmittingMessage ? t('group.chat.submitting') : t('common.actions.send')}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  )
}
