import { Activity, CheckCircle2, Clock, Timer, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../i18n/use-app-translation'
import {
  getAssistantHeartbeat,
  getCronRuns,
  getHeartbeatRunsOnly,
  type AssistantHeartbeatRecord,
  type CronRunRecord,
  type HeartbeatRunRecord
} from './assistant-heartbeat-query'

type AssistantActivityPanelProps = {
  assistantId: string
  workspacePath: string
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Never'
  }

  return new Date(value).toLocaleString()
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  const startedAtMs = new Date(startedAt).getTime()
  const finishedAtMs = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const durationMs = Math.max(finishedAtMs - startedAtMs, 0)
  const seconds = Math.floor(durationMs / 1000)

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function RunList({
  runs,
  emptyMessage
}: {
  runs: Array<HeartbeatRunRecord | CronRunRecord>
  emptyMessage: string
}): React.JSX.Element {
  const { t } = useTranslation()

  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const isSuccess = run.status === 'success'

        return (
          <article key={run.id} className="rounded-lg border border-border/60 bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {isSuccess ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : (
                    <XCircle className="size-4 text-destructive" />
                  )}
                  <span
                    className={
                      isSuccess
                        ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-300'
                        : 'rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
                    }
                  >
                    {run.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('assistants.editor.activity.scheduledLabel')}:{' '}
                    {new Date(run.scheduledFor).toLocaleString()}
                  </span>
                </div>

                {run.outputText ? (
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {t('assistants.editor.activity.outputLabel')}:
                    </span>{' '}
                    {run.outputText.length > 220
                      ? `${run.outputText.slice(0, 220)}...`
                      : run.outputText}
                  </p>
                ) : null}

                {run.error ? (
                  <p className="text-sm text-destructive">
                    {String(run.error.message ?? 'Unknown error')}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                <span>
                  {t('assistants.editor.activity.durationLabel')}:{' '}
                  {formatDuration(run.startedAt, run.finishedAt)}
                </span>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function AssistantActivityPanel({
  assistantId,
  workspacePath
}: AssistantActivityPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const [heartbeat, setHeartbeat] = useState<AssistantHeartbeatRecord | null>(null)
  const [heartbeatRuns, setHeartbeatRuns] = useState<HeartbeatRunRecord[]>([])
  const [cronRuns, setCronRuns] = useState<CronRunRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (workspacePath.trim().length === 0) {
      setHeartbeat(null)
      setHeartbeatRuns([])
      setCronRuns([])
      setIsLoading(false)
      setErrorMessage(null)
      hasLoadedRef.current = false
      return
    }

    let active = true

    const loadActivity = async (): Promise<void> => {
      if (!hasLoadedRef.current) {
        setIsLoading(true)
      }

      try {
        const [nextHeartbeat, nextHeartbeatRuns, nextCronRuns] = await Promise.all([
          getAssistantHeartbeat(assistantId),
          getHeartbeatRunsOnly(assistantId),
          getCronRuns(assistantId)
        ])

        if (!active) {
          return
        }

        setHeartbeat(nextHeartbeat)
        setHeartbeatRuns(nextHeartbeatRuns.runs.slice(0, 6))
        setCronRuns(nextCronRuns.runs.slice(0, 6))
        setErrorMessage(null)
        hasLoadedRef.current = true
      } catch (error) {
        if (!active) {
          return
        }

        setErrorMessage(
          error instanceof Error ? error.message : t('common.errors.unexpectedRequest')
        )
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadActivity()
    const intervalId = window.setInterval(() => {
      void loadActivity()
    }, 10000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [assistantId, t, workspacePath])

  if (workspacePath.trim().length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('assistants.editor.activity.workspaceRequired')}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('assistants.editor.activity.description')}</p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('assistants.editor.activity.loading')}</p>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-border/70 bg-card/50 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="size-4" />
            <h3 className="text-base font-medium">
              {t('assistants.editor.activity.heartbeatTitle')}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('assistants.editor.activity.heartbeatDescription')}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t('assistants.editor.activity.statusLabel')}
            </p>
            <p className="mt-2 text-sm font-medium">
              {heartbeat?.enabled
                ? t('assistants.editor.activity.enabled')
                : t('assistants.editor.activity.disabled')}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t('assistants.editor.activity.intervalLabel')}
            </p>
            <p className="mt-2 text-sm font-medium">
              {heartbeat
                ? `${heartbeat.intervalMinutes} min`
                : t('assistants.editor.activity.never')}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t('assistants.editor.activity.lastRunLabel')}
            </p>
            <p className="mt-2 text-sm font-medium">
              {heartbeat?.lastRunAt
                ? new Date(heartbeat.lastRunAt).toLocaleString()
                : t('assistants.editor.activity.never')}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t('assistants.editor.activity.nextRunLabel')}
            </p>
            <p className="mt-2 text-sm font-medium">
              {formatDateTime(heartbeat?.nextRunAt ?? null)}
            </p>
          </div>
        </div>

        <RunList
          runs={heartbeatRuns}
          emptyMessage={t('assistants.editor.activity.noHeartbeatRuns')}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-border/70 bg-card/50 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Timer className="size-4" />
            <h3 className="text-base font-medium">{t('assistants.editor.activity.cronTitle')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('assistants.editor.activity.cronDescription')}
          </p>
        </div>

        <RunList runs={cronRuns} emptyMessage={t('assistants.editor.activity.noCronRuns')} />
      </section>
    </div>
  )
}
