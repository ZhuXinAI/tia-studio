import { Cable, CheckCircle2, CircleAlert, MessageSquare, RefreshCw, Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { Button } from '../../../components/ui/button'
import { createApiClient } from '../../../lib/api-client'
import { useTranslation } from '../../../i18n/use-app-translation'
import { getMcpServersAuth, getMcpServersHealth, getMcpServersSettings, type McpServerHealth } from '../../settings/mcp-servers/mcp-servers-query'
import { listChannels, type ConfiguredChannelRecord } from '../../settings/channels/channels-query'

const api = createApiClient()

function Status({ state, label }: { state: 'connected' | 'error' | 'pending'; label: string }): React.JSX.Element {
  const connected = state === 'connected'
  return <span className="flex items-center gap-1.5 text-xs"><span className={`size-2 rounded-full ${connected ? 'bg-emerald-500' : state === 'error' ? 'bg-red-500' : 'bg-amber-500'}`} />{label}</span>
}

function channelState(channel: ConfiguredChannelRecord): 'connected' | 'error' | 'pending' {
  if (channel.status === 'connected') return 'connected'
  if (channel.status === 'error') return 'error'
  return 'pending'
}

function mcpState(health: McpServerHealth | undefined): 'connected' | 'error' | 'pending' {
  if (health?.state === 'connected') return 'connected'
  if (health?.state === 'error') return 'error'
  return 'pending'
}

export function IntegrationsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const channels = useQuery({ queryKey: ['integrations', 'channels'], queryFn: listChannels, refetchInterval: 10_000 })
  const mcp = useQuery({ queryKey: ['integrations', 'mcp'], queryFn: getMcpServersSettings, refetchInterval: 10_000 })
  const health = useQuery({ queryKey: ['integrations', 'mcp-health'], queryFn: getMcpServersHealth, refetchInterval: 10_000, enabled: !mcp.isLoading })
  const auth = useQuery({ queryKey: ['integrations', 'mcp-auth'], queryFn: getMcpServersAuth, refetchInterval: 10_000, enabled: !mcp.isLoading })
  const skills = useQuery({ queryKey: ['integrations', 'skills'], queryFn: () => api.get<{ skills: Array<{ id: string; name: string; installedGlobal: boolean }> }>('/v1/desktop/skill-marketplace') })
  const refresh = () => { void channels.refetch(); void mcp.refetch(); void health.refetch(); void auth.refetch(); void skills.refetch() }
  const mcpEntries = Object.entries(mcp.data?.mcpServers ?? {})
  const connectedCount = channels.data?.filter((channel) => channel.status === 'connected').length ?? 0
  const mcpConnectedCount = mcpEntries.filter(([id]) => health.data?.[id]?.state === 'connected').length

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--surface-paper)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--surface-border)] px-6 py-5">
        <div><p className="section-kicker">{t('integrationsPage.kicker')}</p><h1 className="font-editorial text-[2.5rem] leading-none tracking-[-0.04em]">{t('integrationsPage.title')}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('integrationsPage.description')}</p></div>
        <Button type="button" variant="outline" onClick={refresh}><RefreshCw className="size-4" /> {t('integrationsPage.refresh')}</Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary icon={<Cable className="size-4" />} label={t('integrationsPage.mcpServices')} value={`${mcpConnectedCount}/${mcpEntries.length}`} />
            <Summary icon={<MessageSquare className="size-4" />} label={t('integrationsPage.channelsConnected')} value={`${connectedCount}/${channels.data?.length ?? 0}`} />
            <Summary icon={<Sparkles className="size-4" />} label={t('integrationsPage.skillsInstalled')} value={String(skills.data?.skills.filter((skill) => skill.installedGlobal).length ?? 0)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-4 shadow-[var(--surface-shadow)]">
              <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><Cable className="size-4" /> {t('integrationsPage.mcpServices')}</h2><Button asChild variant="ghost" size="sm"><NavLink to="/skills?tab=mcps">{t('integrationsPage.manage')}</NavLink></Button></div>
              <div className="mt-3 divide-y divide-[color:var(--surface-border)]">
                {mcpEntries.length ? mcpEntries.map(([id, server]) => <div key={id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{id}</p><p className="truncate text-xs text-muted-foreground">{server.type} · {auth.data?.[id] ?? t('integrationsPage.notSignedIn')}</p></div><Status state={mcpState(health.data?.[id])} label={health.data?.[id]?.state ?? t('integrationsPage.checking')} /></div>) : <p className="py-4 text-sm text-muted-foreground">{t('integrationsPage.noMcp')}</p>}
              </div>
            </section>
            <section className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-4 shadow-[var(--surface-shadow)]">
              <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><MessageSquare className="size-4" /> {t('integrationsPage.messagingChannels')}</h2><Button asChild variant="ghost" size="sm"><NavLink to="/settings/channels">{t('integrationsPage.manage')}</NavLink></Button></div>
              <div className="mt-3 divide-y divide-[color:var(--surface-border)]">
                {channels.data?.length ? channels.data.map((channel) => <div key={channel.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{channel.name}</p><p className="truncate text-xs text-muted-foreground">{channel.type} · {t('integrationsPage.paired', { count: channel.pairedCount })}</p></div><Status state={channelState(channel)} label={channel.status} /></div>) : <p className="py-4 text-sm text-muted-foreground">{t('integrationsPage.noChannels')}</p>}
              </div>
            </section>
          </div>
          <section className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-4 shadow-[var(--surface-shadow)]"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><Sparkles className="size-4" /> {t('integrationsPage.skillsRuntime')}</h2><Button asChild variant="ghost" size="sm"><NavLink to="/skills">{t('integrationsPage.manage')}</NavLink></Button></div><p className="mt-2 text-sm text-muted-foreground">{t('integrationsPage.skillsRuntimeDescription')}</p><div className="mt-3 flex flex-wrap gap-2">{(skills.data?.skills ?? []).filter((skill) => skill.installedGlobal).slice(0, 12).map((skill) => <span key={skill.id} className="rounded-full bg-muted px-3 py-1 text-xs">{skill.name}</span>)}{!skills.isLoading && !(skills.data?.skills ?? []).some((skill) => skill.installedGlobal) ? <span className="text-xs text-muted-foreground">{t('integrationsPage.noSkills')}</span> : null}</div></section>
          {channels.isError || mcp.isError ? <p className="flex items-center gap-2 text-xs text-destructive"><CircleAlert className="size-3.5" /> {t('integrationsPage.connectionError')}</p> : null}
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" /> {t('integrationsPage.autoRefresh')}</p>
        </div>
      </div>
    </section>
  )
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }): React.JSX.Element { return <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel)] p-4 shadow-[var(--surface-shadow)]"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{icon}{label}</div><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p></div> }
