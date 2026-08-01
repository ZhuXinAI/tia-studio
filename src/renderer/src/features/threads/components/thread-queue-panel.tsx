import type { AgentSessionSnapshot } from '../../../../../shared/agent-runtime'
import { cn } from '../../../lib/utils'
import { useTranslation } from '../../../i18n/use-app-translation'

export function ThreadQueuePanel({
  queue
}: {
  queue: AgentSessionSnapshot['queue']
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const items = [
    ...queue.steering.map((text) => ({ behavior: 'steer' as const, text })),
    ...queue.followUps.map((text) => ({ behavior: 'follow-up' as const, text }))
  ]
  if (items.length === 0) return null

  return (
    <div
      aria-label={t('threads.composer.runningBehavior')}
      className="mx-2 overflow-hidden rounded-lg border border-border/70 bg-muted/35"
    >
      {items.map((item, index) => (
        <div
          key={`${item.behavior}-${index}-${item.text}`}
          className={cn(
            'flex min-h-9 items-center gap-2 px-3 py-1.5 text-xs',
            index > 0 && 'border-t border-border/60'
          )}
        >
          <span className="shrink-0 font-medium text-foreground">
            {item.behavior === 'steer'
              ? t('threads.composer.steer')
              : t('threads.composer.followUp')}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.text}</span>
        </div>
      ))}
    </div>
  )
}
