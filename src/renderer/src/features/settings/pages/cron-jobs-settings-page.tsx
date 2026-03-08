import { AlarmClock } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0) {
      return message
    }
  }

  return 'Unexpected request error'
}

function formatTimestamp(value: string | null, fallback: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback
  }

  return value
}

function formatStatus(value: CronJobRecord['lastRunStatus']): string {
  if (value === 'success') {
    return 'success'
  }

  if (value === 'failed') {
    return 'failed'
  }

  return 'never run'
}

export function CronJobsSettingsPage(): React.JSX.Element {
  const [cronJobs, setCronJobs] = useState<CronJobRecord[]>([])
  const [assistants, setAssistants] = useState<AssistantRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

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
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const assistantNames = useMemo(() => {
    return new Map(assistants.map((assistant) => [assistant.id, assistant.name]))
  }, [assistants])

  return (
    <div className="py-4 flex flex-col gap-4 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cron Jobs</h1>
        <p className="text-muted-foreground text-sm">
          Review scheduler status, next runs, and the latest runtime errors for workspace cron jobs.
        </p>
      </header>

      <Card className="border-border/70 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlarmClock className="size-5" />
            <span>Scheduled Jobs</span>
          </CardTitle>
          <CardDescription>
            Hidden cron threads stay out of normal chat history while their runtime status is
            persisted here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading cron jobs…</p>
          ) : cronJobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No cron jobs configured yet. Create one through the cron job API to start scheduling
              runs.
            </p>
          ) : (
            cronJobs.map((cronJob) => (
              <div key={cronJob.id} className="space-y-3 rounded-lg border border-border/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-base font-medium">{cronJob.name}</h2>
                    <p className="text-muted-foreground text-xs">
                      Assistant: {assistantNames.get(cronJob.assistantId) ?? cronJob.assistantId}
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {cronJob.enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>

                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      Cron Expression
                    </dt>
                    <dd>{cronJob.cronExpression}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      Next Run
                    </dt>
                    <dd>{formatTimestamp(cronJob.nextRunAt, 'Not scheduled')}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      Last Status
                    </dt>
                    <dd>{formatStatus(cronJob.lastRunStatus)}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      Last Run
                    </dt>
                    <dd>{formatTimestamp(cronJob.lastRunAt, 'Never')}</dd>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                      Last Error
                    </dt>
                    <dd>{cronJob.lastError ?? 'None'}</dd>
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
