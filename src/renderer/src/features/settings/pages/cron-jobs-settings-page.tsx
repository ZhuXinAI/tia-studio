import { AlarmClock } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../../i18n/use-app-translation'
import { toast } from 'sonner'
import { listAssistants, type AssistantRecord } from '../../assistants/assistants-query'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { listCronJobs, type CronJobRecord } from '../cron-jobs/cron-jobs-query'

function formatTimestamp(value: string | null, fallback: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback
  }

  const date = new Date(value)
  if (isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

export function CronJobsSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [cronJobs, setCronJobs] = useState<CronJobRecord[]>([])
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const toErrorMessage = useCallback(
    (error: unknown): string => {
      if (error instanceof Error) {
        const message = error.message.trim()
        if (message.length > 0) {
          return message
        }
      }

      return t('settings.cronJobs.toasts.unexpectedError')
    },
    [t]
  )

  const formatStatus = (value: CronJobRecord['lastRunStatus']): string => {
    if (value === 'success') {
      return t('settings.cronJobs.status.success')
    }

    if (value === 'failed') {
      return t('settings.cronJobs.status.failed')
    }

    return t('settings.cronJobs.status.neverRun')
  }

  const loadData = useCallback(async () => {
    setIsLoading(true)

    try {
      const [cronJobsList, assistantsList] = await Promise.all([listCronJobs(), listAssistants()])
      setCronJobs(cronJobsList)
      setAssistants(assistantsList)
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [toErrorMessage])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const assistantNames = useMemo(() => {
    return new Map(assistants.map((assistant) => [assistant.id, assistant.name]))
  }, [assistants])

  return (
    <div className="py-4 flex flex-col gap-4 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.cronJobs.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('settings.cronJobs.description')}</p>
      </header>

      <Card className="border-border/70 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlarmClock className="size-5" />
            <span>{t('settings.cronJobs.cardTitle')}</span>
          </CardTitle>
          <CardDescription>{t('settings.cronJobs.cardDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{t('settings.cronJobs.loading')}</p>
          ) : cronJobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('settings.cronJobs.empty')}</p>
          ) : (
            cronJobs.map((cronJob) => (
              <div key={cronJob.id} className="space-y-3 rounded-lg border border-border/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-base font-medium">{cronJob.name}</h2>
                    <p className="text-muted-foreground text-xs">
                      {t('settings.cronJobs.assistantLabel', {
                        assistant: assistantNames.get(cronJob.assistantId) ?? cronJob.assistantId
                      })}
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {cronJob.enabled
                      ? t('settings.cronJobs.enabled')
                      : t('settings.cronJobs.disabled')}
                  </p>
                </div>

                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t('settings.cronJobs.fields.cronExpression')}
                    </dt>
                    <dd>{cronJob.cronExpression}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t('settings.cronJobs.fields.nextRun')}
                    </dt>
                    <dd>
                      {formatTimestamp(
                        cronJob.nextRunAt,
                        t('settings.cronJobs.fallbacks.notScheduled')
                      )}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      Thread ID
                    </dt>
                    <dd className="font-mono text-xs truncate">
                      {cronJob.threadId ?? 'N/A'}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t('settings.cronJobs.fields.lastStatus')}
                    </dt>
                    <dd>{formatStatus(cronJob.lastRunStatus)}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t('settings.cronJobs.fields.lastRun')}
                    </dt>
                    <dd>
                      {formatTimestamp(cronJob.lastRunAt, t('settings.cronJobs.fallbacks.never'))}
                    </dd>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t('settings.cronJobs.fields.lastError')}
                    </dt>
                    <dd>{cronJob.lastError ?? t('settings.cronJobs.fallbacks.none')}</dd>
                  </div>
                </dl>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
