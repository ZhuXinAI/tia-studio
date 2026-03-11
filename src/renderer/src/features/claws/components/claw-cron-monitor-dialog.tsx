import { useEffect, useState } from 'react'
import { Clock, CheckCircle2, XCircle, Timer } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog'
import { getCronRuns, type CronRunRecord } from '../../assistants/assistant-heartbeat-query'

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

function formatDuration(startedAt: string, finishedAt: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const durationMs = end - start
  const seconds = Math.floor(durationMs / 1000)

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export function ClawCronMonitorDialog({
  isOpen,
  assistantId,
  assistantName,
  onClose
}: ClawCronMonitorDialogProps): React.JSX.Element {
  const [runs, setRuns] = useState<CronRunRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function loadData(): Promise<void> {
    if (!assistantId) {
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const runsData = await getCronRuns(assistantId)
      setRuns(runsData.runs)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load cron data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && assistantId) {
      void loadData()
    }
  }, [isOpen, assistantId, loadData])

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
  }, [isOpen, assistantId, loadData])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="size-5" />
            Cron Monitor - {assistantName}
          </DialogTitle>
          <DialogDescription>Recent cron job executions and their status</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : errorMessage ? (
          <div className="py-4 text-sm text-destructive">{errorMessage}</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium">Recent Cron Runs (Last 10)</div>
              {runs.length === 0 ? (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                  No cron runs yet
                </div>
              ) : (
                <div className="h-[400px] overflow-y-auto rounded-lg border">
                  <div className="divide-y">
                    {runs.map((run) => (
                      <div key={run.id} className="p-4 hover:bg-muted/50">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            {run.status === 'success' ? (
                              <CheckCircle2 className="mt-0.5 size-5 text-green-600" />
                            ) : (
                              <XCircle className="mt-0.5 size-5 text-destructive" />
                            )}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    run.status === 'success'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  }`}
                                >
                                  {run.status}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDateTime(run.scheduledFor)}
                                </span>
                              </div>
                              {run.outputText ? (
                                <div className="max-w-xl text-sm text-muted-foreground">
                                  {run.outputText.length > 200
                                    ? `${run.outputText.slice(0, 200)}...`
                                    : run.outputText}
                                </div>
                              ) : null}
                              {run.error ? (
                                <div className="text-sm text-destructive">
                                  Error: {String(run.error.message ?? 'Unknown error')}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            {formatDuration(run.startedAt, run.finishedAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
