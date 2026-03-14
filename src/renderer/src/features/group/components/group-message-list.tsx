import { useTranslation } from '../../../i18n/use-app-translation'
import { cn } from '../../../lib/utils'
import type { GroupRoomMessageRecord } from '../group-chat-query'

type GroupMessageListProps = {
  messages: GroupRoomMessageRecord[]
  isLoadingMessages: boolean
  loadError: string | null
}

function getAuthorLabel(
  message: GroupRoomMessageRecord,
  labels: {
    you: string
    orchestrator: string
    system: string
  }
): string {
  if (message.authorType === 'watcher') {
    return labels.you
  }

  if (message.authorType === 'orchestrator') {
    return message.authorName.trim().length > 0 ? message.authorName : labels.orchestrator
  }

  if (message.role === 'system') {
    return message.authorName.trim().length > 0 ? message.authorName : labels.system
  }

  return message.authorName
}

function getMessageTone(authorType: GroupRoomMessageRecord['authorType']): string {
  if (authorType === 'watcher') {
    return 'border-sky-300/40 bg-sky-500/8'
  }

  if (authorType === 'orchestrator') {
    return 'border-amber-300/40 bg-amber-500/8'
  }

  return 'border-border/70 bg-muted/20'
}

export function GroupMessageList({
  messages,
  isLoadingMessages,
  loadError
}: GroupMessageListProps): React.JSX.Element {
  const { t } = useTranslation()

  if (loadError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center">
        <p className="text-destructive text-sm">{loadError}</p>
      </div>
    )
  }

  if (isLoadingMessages) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-center">
        <p className="text-muted-foreground text-sm">{t('group.messageList.loadingHistory')}</p>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-center">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('group.messageList.emptyTitle')}</p>
          <p className="text-muted-foreground text-sm">{t('group.messageList.emptyDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <div className="space-y-3">
        {messages.map((message) => (
          <article
            key={message.id}
            className={cn('rounded-xl border px-4 py-3 text-sm shadow-xs', getMessageTone(message.authorType))}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-foreground">
                {getAuthorLabel(message, {
                  you: t('group.messageList.you'),
                  orchestrator: t('group.messageList.orchestrator'),
                  system: t('group.messageList.system')
                })}
              </span>
              <span className="text-muted-foreground">{new Date(message.createdAt).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-wrap leading-6">{message.content}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
