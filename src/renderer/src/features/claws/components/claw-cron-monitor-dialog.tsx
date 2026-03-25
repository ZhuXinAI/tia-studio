import { useCallback, useEffect, useState } from 'react'
import { AlarmClock, Clock3, Timer } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import { listCronJobs, type CronJobRecord } from '../../settings/cron-jobs/cron-jobs-query'

type ClawCronMonitorDialogProps = {
  isOpen: boolean
  assistantId: string | null
  assistantName: string
  onClose: () => void
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString()
}

export function ClawCronMonitorDialog({
  isOpen,
  assistantId,
  assistantName,
  onClose
}: ClawCronMonitorDialogProps): React.JSX.Element {
  const [cronJobs, setCronJobs] = useState<CronJobRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadData = useCallback(async (): Promise<void> => {
    if (!assistantId) {
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const allCronJobs = await listCronJobs()
      setCronJobs(allCronJobs.filter((cronJob) => cronJob.assistantId === assistantId))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load cron data')
    } finally {
      setIsLoading(false)
    }
  }, [assistantId])

  useEffect(() => {
    if (isOpen && assistantId) {
      void loadData()
    }
  }, [assistantId, isOpen, loadData])

  useEffect(() => {
    if (!isOpen || !assistantId) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadData()
    }, 10000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [assistantId, isOpen, loadData])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="size-5" />
            Cron Jobs - {assistantName}
          </DialogTitle>
          <DialogDescription>
            Review this assistant&apos;s cron schedule and next planned runs.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : errorMessage ? (
          <div className="py-4 text-sm text-destructive">{errorMessage}</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium">Configured Cron Jobs</div>
              {cronJobs.length === 0 ? (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                  No cron jobs configured for this assistant
                </div>
              ) : (
                <div className="space-y-3">
                  {cronJobs.map((cronJob) => (
                    <div
                      key={cronJob.id}
                      className="rounded-xl border border-border/70 bg-card/50 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-medium">{cronJob.name}</p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                cronJob.enabled
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {cronJob.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{cronJob.prompt}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <AlarmClock className="size-3" />
                          {cronJob.cronExpression}
                        </div>
                      </div>

                      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                        <div className="space-y-1">
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            Next Run
                          </dt>
                          <dd className="flex items-center gap-1">
                            <Clock3 className="size-3 text-muted-foreground" />
                            {cronJob.nextRunAt
                              ? formatDateTime(cronJob.nextRunAt)
                              : 'Not scheduled'}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            Last Run
                          </dt>
                          <dd>{cronJob.lastRunAt ? formatDateTime(cronJob.lastRunAt) : 'Never'}</dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            Last Status
                          </dt>
                          <dd>{cronJob.lastRunStatus ?? 'Never run'}</dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            Thread ID
                          </dt>
                          <dd className="truncate font-mono text-xs">
                            {cronJob.threadId ?? 'N/A'}
                          </dd>
                        </div>
                        {cronJob.lastError ? (
                          <div className="space-y-1 md:col-span-2">
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                              Last Error
                            </dt>
                            <dd className="text-destructive">{cronJob.lastError}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
