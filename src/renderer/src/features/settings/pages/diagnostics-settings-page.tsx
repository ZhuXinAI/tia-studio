import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, Database, RefreshCw, Server, ShieldCheck } from 'lucide-react'
import type { HealthDependencySignal, HealthSnapshot } from '../../../../../shared/health'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/card'
import { createApiClient } from '../../../lib/api-client'
import { useTranslation } from '../../../i18n/use-app-translation'

const api = createApiClient()

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB']
  let amount = value / 1024
  let unit = units[0]
  for (let index = 0; index < units.length - 1 && amount >= 1024; index += 1) {
    amount /= 1024
    unit = units[index + 1] ?? unit
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${unit}`
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return `${hours}h ${minutes}m ${remainingSeconds}s`
}

export function DiagnosticsSettingsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const health = useQuery({
    queryKey: ['diagnostics', 'health'],
    queryFn: () => api.get<HealthSnapshot>('/v1/health'),
    refetchInterval: 10_000
  })

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-kicker">{t('diagnostics.kicker')}</p>
          <h1 className="settings-page-title">{t('diagnostics.title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t('diagnostics.description')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void health.refetch()}
          disabled={health.isFetching}
        >
          <RefreshCw className="size-3.5" /> {t('diagnostics.refresh')}
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          icon={<Activity className="size-4 text-emerald-500" />}
          label={t('diagnostics.apiBridge')}
          value={
            health.isError
              ? t('diagnostics.unavailable')
              : health.isLoading
                ? t('diagnostics.checking')
                : t('diagnostics.healthy')
          }
        />
        <Metric
          icon={<Server className="size-4 text-blue-500" />}
          label={t('diagnostics.processUptime')}
          value={health.data ? formatUptime(health.data.uptimeSeconds) : '—'}
        />
        <Metric
          icon={<Database className="size-4 text-violet-500" />}
          label={t('diagnostics.memoryRss')}
          value={health.data ? formatBytes(health.data.memory.rssBytes) : '—'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('diagnostics.dependenciesTitle')}</CardTitle>
          <CardDescription>{t('diagnostics.dependenciesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <DependencySignal
            label={t('diagnostics.providers')}
            signal={health.data?.dependencies?.providers}
            t={t}
          />
          <DependencySignal
            label={t('diagnostics.mcp')}
            signal={health.data?.dependencies?.mcp}
            t={t}
          />
          <DependencySignal
            label={t('diagnostics.channels')}
            signal={health.data?.dependencies?.channels}
            t={t}
          />
        </CardContent>
      </Card>

      {health.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {t('diagnostics.error')}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4" /> {t('diagnostics.runtimeSnapshot')}
            </CardTitle>
            <CardDescription>{t('diagnostics.runtimeDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {health.data ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('diagnostics.status')}</dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    {health.data.status}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('diagnostics.platform')}</dt>
                  <dd className="mt-1 font-medium">{health.data.platform}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('diagnostics.nodeRuntime')}</dt>
                  <dd className="mt-1 font-mono text-xs">{health.data.nodeVersion}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('diagnostics.lastChecked')}</dt>
                  <dd className="mt-1 font-medium">
                    {new Date(health.data.checkedAt).toLocaleString(i18n.language)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('diagnostics.heapUsed')}</dt>
                  <dd className="mt-1 font-medium">
                    {formatBytes(health.data.memory.heapUsedBytes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('diagnostics.heapTotal')}</dt>
                  <dd className="mt-1 font-medium">
                    {formatBytes(health.data.memory.heapTotalBytes)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{t('diagnostics.noSnapshot')}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> {t('diagnostics.reliabilityContract')}
            </CardTitle>
            <CardDescription>{t('diagnostics.contractDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>• {t('diagnostics.contractHealth')}</li>
              <li>• {t('diagnostics.contractSurfaces')}</li>
              <li>• {t('diagnostics.contractSecrets')}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function DependencySignal({
  label,
  signal,
  t
}: {
  label: string
  signal: HealthDependencySignal | undefined
  t: (key: string, options?: Record<string, unknown>) => string
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-sm font-semibold">
        {signal ? t(`diagnostics.signalStates.${signal.state}`) : t('diagnostics.noSignal')}
      </p>
      {signal ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t('diagnostics.signalCounts', {
            configured: signal.configuredCount,
            healthy: signal.healthyCount,
            errors: signal.errorCount
          })}
        </p>
      ) : null}
    </div>
  )
}

function Metric({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-4 shadow-[var(--surface-shadow)]">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
