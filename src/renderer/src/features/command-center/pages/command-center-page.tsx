import { Activity, AlertCircle, Clock3, ExternalLink, LoaderCircle, Plus, ShieldAlert, Square } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { AgentSessionSnapshot } from '../../../../../shared/agent-runtime'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useTranslation } from '../../../i18n/use-app-translation'
import { cancelAgentRun, useAgentSessions } from '../../threads/agent-sessions-query'
import { getThreadDisplayTitle } from '../../threads/thread-page-routing'
import { useWorkspaces } from '../../workspaces/workspaces-query'

function sessionHref(session: AgentSessionSnapshot): string {
  return session.workspaceId
    ? `/workspaces/${session.workspaceId}/threads/${session.id}`
    : `/chat/${session.id}`
}

function statusLabel(
  session: AgentSessionSnapshot,
  translate: (key: string) => string
): string {
  if (session.pendingInteraction) return translate('commandCenter.status.needsApproval')
  if (session.status === 'running' || session.status === 'recovering') {
    return translate('commandCenter.status.running')
  }
  if (session.status === 'error') return translate('commandCenter.status.error')
  if (session.status === 'stopped') return translate('commandCenter.status.stopped')
  return translate('commandCenter.status.idle')
}

function statusClass(session: AgentSessionSnapshot): string {
  if (session.pendingInteraction) return 'bg-amber-500'
  if (session.status === 'running' || session.status === 'recovering') return 'bg-blue-500'
  if (session.status === 'error') return 'bg-red-500'
  return 'bg-muted-foreground/50'
}

export function CommandCenterPage(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: sessions = [], isLoading, isFetching, refetch } = useAgentSessions()
  const { data: workspaces = [] } = useWorkspaces()
  const [query, setQuery] = useState('')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const workspaceNames = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces]
  )
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return sessions
      .filter((session) => {
        if (!normalized) return true
        return `${session.title} ${session.modelId} ${session.workspacePath}`.toLowerCase().includes(normalized)
      })
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  }, [query, sessions])
  const running = sessions.filter((session) => session.status === 'running' || session.status === 'recovering')
  const approvals = sessions.filter((session) => Boolean(session.pendingInteraction))
  const errors = sessions.filter((session) => session.status === 'error')

  async function cancel(sessionId: string): Promise<void> {
    setCancellingId(sessionId)
    try {
      await cancelAgentRun(sessionId)
      await refetch()
      toast.success(t('commandCenter.cancelRequested'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('commandCenter.cancelFailed'))
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--surface-paper)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--surface-border)] px-6 py-5">
        <div>
          <p className="section-kicker">{t('commandCenter.kicker')}</p>
          <h1 className="font-editorial text-[2.5rem] leading-none tracking-[-0.04em]">{t('commandCenter.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('commandCenter.description')}</p>
        </div>
        <Button type="button" onClick={() => navigate('/chat/new')}><Plus className="size-4" /> {t('commandCenter.newThread')}</Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard icon={<Activity className="size-4" />} label={t('commandCenter.running')} value={running.length} tone="text-blue-500" />
            <SummaryCard icon={<ShieldAlert className="size-4" />} label={t('commandCenter.needsApproval')} value={approvals.length} tone="text-amber-500" />
            <SummaryCard icon={<AlertCircle className="size-4" />} label={t('commandCenter.errors')} value={errors.length} tone="text-red-500" />
          </div>
          <div className="flex items-center gap-3">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('commandCenter.filterPlaceholder')} className="max-w-xl" />
            {isFetching ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label={t('commandCenter.refreshing')} /> : null}
          </div>
          <div className="overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] shadow-[var(--surface-shadow)]">
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_minmax(7rem,auto)_auto] gap-3 border-b border-[color:var(--surface-border)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>{t('commandCenter.table.thread')}</span><span>{t('commandCenter.table.workspace')}</span><span>{t('commandCenter.table.status')}</span><span />
            </div>
            {isLoading ? <p className="p-6 text-sm text-muted-foreground">{t('commandCenter.loading')}</p> : null}
            {!isLoading && filtered.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{t('commandCenter.noMatching')}</p> : null}
            <div className="divide-y divide-[color:var(--surface-border)]">
              {filtered.map((session) => (
                <div key={session.id} className="grid grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_minmax(7rem,auto)_auto] items-center gap-3 px-4 py-3 text-sm hover:bg-[color:var(--surface-muted)]">
                  <div className="min-w-0">
                    <NavLink to={sessionHref(session)} className="truncate font-medium hover:underline">{getThreadDisplayTitle(session.title)}</NavLink>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{session.modelId} · {session.workspacePath}</p>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{session.workspaceId ? workspaceNames.get(session.workspaceId) ?? t('commandCenter.workspaceFallback') : t('commandCenter.chats')}</span>
                  <span className="flex items-center gap-1.5 text-xs"><span className={`size-2 rounded-full ${statusClass(session)}`} />{statusLabel(session, t)}</span>
                  <div className="flex items-center gap-1">
                    {session.status === 'running' || session.status === 'recovering' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t('commandCenter.cancelRun')}
                        disabled={cancellingId === session.id}
                        onClick={() => void cancel(session.id)}
                      >
                        {cancellingId === session.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
                      </Button>
                    ) : null}
                    <Button asChild type="button" variant="ghost" size="icon" className="size-7" aria-label={t('commandCenter.openThread')}><NavLink to={sessionHref(session)}><ExternalLink className="size-3.5" /></NavLink></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> {t('commandCenter.autoRefresh')}</p>
        </div>
      </div>
    </section>
  )
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }): React.JSX.Element {
  return <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-4 shadow-[var(--surface-shadow)]"><div className={`flex items-center gap-2 text-xs font-medium ${tone}`}>{icon}{label}</div><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p></div>
}
