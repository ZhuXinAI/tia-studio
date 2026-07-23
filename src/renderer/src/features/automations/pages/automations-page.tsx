import { useEffect, useMemo, useState } from 'react'
import { Clock3, Pause, Play, Plus, Save, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { SaveTiaAutomationInput, TiaAutomationRecord } from '../../../../../shared/automations'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { cn } from '../../../lib/utils'
import { useProviders } from '../../settings/providers/providers-query'
import { useWorkspaces } from '../../workspaces/workspaces-query'
import {
  useAutomations,
  useCreateAutomation,
  useDeleteAutomation,
  useRunAutomation,
  useUpdateAutomation
} from '../automations-query'
import { useTranslation } from '../../../i18n/use-app-translation'

type Draft = SaveTiaAutomationInput & {
  frequency: 'HOURLY' | 'DAILY' | 'WEEKLY'
  time: string
  weekday: string
}

const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

function parseSchedule(rrule: string): Pick<Draft, 'frequency' | 'time' | 'weekday'> {
  const values = Object.fromEntries(
    rrule
      .replace(/^RRULE:/, '')
      .split(';')
      .map((part) => part.split('='))
  )
  const frequency = values.FREQ === 'HOURLY' || values.FREQ === 'WEEKLY' ? values.FREQ : 'DAILY'
  return {
    frequency,
    time: `${String(values.BYHOUR ?? '9').padStart(2, '0')}:${String(values.BYMINUTE ?? '0').padStart(2, '0')}`,
    weekday: values.BYDAY ?? 'MO'
  }
}

function toRRule(draft: Draft): string {
  const [hour, minute] = draft.time.split(':').map(Number)
  if (draft.frequency === 'HOURLY') return `FREQ=HOURLY;BYMINUTE=${minute || 0}`
  return `FREQ=${draft.frequency};BYHOUR=${hour || 0};BYMINUTE=${minute || 0}${
    draft.frequency === 'WEEKLY' ? `;BYDAY=${draft.weekday}` : ''
  }`
}

function createDraft(
  workspaces: Array<{ id: string }>,
  providers: Array<{ id: string; selectedModel: string }>,
  automation?: TiaAutomationRecord
): Draft {
  const provider = providers.find((item) => item.id === automation?.providerId) ?? providers[0]
  const schedule = parseSchedule(automation?.rrule ?? 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0')
  return {
    name: automation?.name ?? '',
    prompt: automation?.prompt ?? '',
    status: automation?.status ?? 'active',
    rrule: automation?.rrule ?? 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
    workspaceId: automation?.workspaceId ?? workspaces[0]?.id ?? '',
    providerId: automation?.providerId ?? provider?.id ?? '',
    modelId: automation?.modelId ?? provider?.selectedModel ?? '',
    ...schedule
  }
}

function formatTimestamp(value: string | null, locale: string, neverLabel: string): string {
  return value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value)
      )
    : neverLabel
}

export function AutomationsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { data: automations = [], isLoading } = useAutomations()
  const { data: workspaces = [] } = useWorkspaces()
  const { data: providers = [] } = useProviders()
  const createMutation = useCreateAutomation()
  const updateMutation = useUpdateAutomation()
  const deleteMutation = useDeleteAutomation()
  const runMutation = useRunAutomation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const selected = automations.find((item) => item.id === selectedId) ?? null
  const [draft, setDraft] = useState<Draft>(() => createDraft([], []))

  function scheduleSummary(rrule: string): string {
    const schedule = parseSchedule(rrule)
    const [, minute = '0'] = schedule.time.split(':')
    if (schedule.frequency === 'WEEKLY') {
      const days = schedule.weekday
        .split(',')
        .map((day) => t(`automations.weekdays.${day}`))
        .join(', ')
      return t('automations.schedule.everyDaysAt', { days, time: schedule.time })
    }
    if (schedule.frequency === 'HOURLY') {
      return t('automations.schedule.everyHourAt', { minute: minute.padStart(2, '0') })
    }
    return t('automations.schedule.everyDayAt', { time: schedule.time })
  }

  useEffect(() => {
    if (!selectedId && automations[0]) setSelectedId(automations[0].id)
  }, [automations, selectedId])

  const workspaceNames = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces]
  )

  function beginEdit(automation?: TiaAutomationRecord): void {
    setDraft(createDraft(workspaces, providers, automation))
    setEditingId(automation?.id ?? 'new')
  }

  async function save(): Promise<void> {
    const input: SaveTiaAutomationInput = { ...draft, rrule: toRRule(draft) }
    try {
      if (editingId === 'new') {
        const created = (await createMutation.mutateAsync(input)) as TiaAutomationRecord
        setSelectedId(created.id)
      } else if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, input })
      }
      setEditingId(null)
      toast.success(t('automations.saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('automations.saveFailed'))
    }
  }

  async function toggleStatus(automation: TiaAutomationRecord): Promise<void> {
    await updateMutation.mutateAsync({
      id: automation.id,
      input: {
        name: automation.name,
        prompt: automation.prompt,
        rrule: automation.rrule,
        workspaceId: automation.workspaceId,
        providerId: automation.providerId,
        modelId: automation.modelId,
        status: automation.status === 'active' ? 'paused' : 'active'
      }
    })
  }

  const mutationPending = createMutation.isPending || updateMutation.isPending
  const showAside = automations.length > 0
  const suggestedSchedules = [
    {
      id: 'daily-brief',
      title: t('automations.suggestions.dailyBrief.title'),
      description: t('automations.suggestions.dailyBrief.description'),
      prompt: t('automations.suggestions.dailyBrief.prompt')
    },
    {
      id: 'weekly-review',
      title: t('automations.suggestions.weeklyReview.title'),
      description: t('automations.suggestions.weeklyReview.description'),
      prompt: t('automations.suggestions.weeklyReview.prompt')
    },
    {
      id: 'follow-up-monitor',
      title: t('automations.suggestions.followUpMonitor.title'),
      description: t('automations.suggestions.followUpMonitor.description'),
      prompt: t('automations.suggestions.followUpMonitor.prompt')
    }
  ]

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--surface-paper)]">
      <header className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">{t('automations.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('automations.description')}</p>
        </div>
        <Button onClick={() => beginEdit()} disabled={!workspaces.length || !providers.length}>
          <Plus className="size-4" /> {t('automations.new')}
        </Button>
      </header>

      <div
        className={cn(
          'grid min-h-0 flex-1',
          showAside ? 'grid-cols-[18rem_minmax(0,1fr)]' : 'grid-cols-1'
        )}
      >
        {showAside ? (
          <aside className="chat-scrollbar overflow-y-auto border-r border-[color:var(--surface-border)] p-3">
            {isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">{t('automations.loading')}</p>
            ) : null}
            <div className="space-y-1">
              {automations.map((automation) => (
                <button
                  key={automation.id}
                  onClick={() => {
                    setSelectedId(automation.id)
                    setEditingId(null)
                  }}
                  className={cn(
                    'w-full rounded-lg px-3 py-2.5 text-left',
                    selectedId === automation.id
                      ? 'bg-[color:var(--surface-active)]'
                      : 'hover:bg-[color:var(--surface-muted)]'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        automation.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground'
                      )}
                    />
                    <span className="truncate text-sm font-medium">{automation.name}</span>
                  </div>
                  <p className="mt-1 truncate pl-4 text-xs text-muted-foreground">
                    {scheduleSummary(automation.rrule)}
                  </p>
                </button>
              ))}
            </div>
          </aside>
        ) : null}

        <main className="chat-scrollbar min-h-0 overflow-y-auto p-6">
          {editingId ? (
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {editingId === 'new' ? t('automations.new') : t('automations.edit')}
                </h2>
                <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}>
                  <X className="size-4" />
                </Button>
              </div>
              <div className="grid gap-4 rounded-xl border border-[color:var(--surface-border)] p-5">
                <label className="grid gap-1.5 text-sm">
                  <span>{t('automations.fields.name')}</span>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>{t('automations.fields.instructions')}</span>
                  <Textarea
                    rows={8}
                    value={draft.prompt}
                    onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span>{t('automations.fields.workspace')}</span>
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={draft.workspaceId}
                      onChange={(e) => setDraft({ ...draft, workspaceId: e.target.value })}
                    >
                      {workspaces.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span>{t('automations.fields.provider')}</span>
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={draft.providerId}
                      onChange={(e) => {
                        const provider = providers.find((item) => item.id === e.target.value)
                        setDraft({
                          ...draft,
                          providerId: e.target.value,
                          modelId: provider?.selectedModel ?? draft.modelId
                        })
                      }}
                    >
                      {providers
                        .filter((item) => item.enabled)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <label className="grid gap-1.5 text-sm">
                  <span>{t('automations.fields.model')}</span>
                  <Input
                    value={draft.modelId}
                    onChange={(e) => setDraft({ ...draft, modelId: e.target.value })}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="grid gap-1.5 text-sm">
                    <span>{t('automations.fields.repeat')}</span>
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={draft.frequency}
                      onChange={(e) =>
                        setDraft({ ...draft, frequency: e.target.value as Draft['frequency'] })
                      }
                    >
                      <option value="HOURLY">{t('automations.frequency.hourly')}</option>
                      <option value="DAILY">{t('automations.frequency.daily')}</option>
                      <option value="WEEKLY">{t('automations.frequency.weekly')}</option>
                    </select>
                  </label>
                  {draft.frequency === 'WEEKLY' ? (
                    <label className="grid gap-1.5 text-sm">
                      <span>{t('automations.fields.day')}</span>
                      <select
                        className="h-10 rounded-md border bg-background px-3"
                        value={draft.weekday}
                        onChange={(e) => setDraft({ ...draft, weekday: e.target.value })}
                      >
                        {weekdays.map((value) => (
                          <option key={value} value={value}>
                            {t(`automations.weekdays.${value}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="grid gap-1.5 text-sm">
                    <span>
                      {draft.frequency === 'HOURLY'
                        ? t('automations.fields.minute')
                        : t('automations.fields.time')}
                    </span>
                    <Input
                      type="time"
                      value={draft.time}
                      onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                    />
                  </label>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => void save()}
                  disabled={mutationPending || !draft.name.trim() || !draft.prompt.trim()}
                >
                  <Save className="size-4" />
                  {mutationPending ? t('automations.saving') : t('automations.save')}
                </Button>
              </div>
            </div>
          ) : selected ? (
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        selected.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground'
                      )}
                    />
                    {t(`automations.status.${selected.status}`)}
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold">{selected.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {scheduleSummary(selected.rrule)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => beginEdit(selected)}>
                    {t('common.actions.edit')}
                  </Button>
                  <Button
                    onClick={() => void runMutation.mutateAsync(selected.id)}
                    disabled={runMutation.isPending}
                  >
                    <Play className="size-4" />
                    {t('automations.runNow')}
                  </Button>
                </div>
              </div>
              <div className="whitespace-pre-wrap rounded-xl border border-[color:var(--surface-border)] p-5 text-sm leading-6">
                {selected.prompt}
              </div>
              <dl className="grid gap-px overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-border)] sm:grid-cols-2">
                {[
                  [
                    t('automations.fields.workspace'),
                    workspaceNames.get(selected.workspaceId) ?? selected.workspaceId
                  ],
                  [t('automations.fields.model'), selected.modelId],
                  [
                    t('automations.fields.nextRun'),
                    formatTimestamp(selected.nextRunAt, i18n.language, t('automations.never'))
                  ],
                  [
                    t('automations.fields.lastRun'),
                    formatTimestamp(selected.lastRunAt, i18n.language, t('automations.never'))
                  ]
                ].map(([label, value]) => (
                  <div key={label} className="bg-[color:var(--surface-paper)] p-4">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-sm">{value}</dd>
                  </div>
                ))}
              </dl>
              {selected.lastError ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {selected.lastError}
                </p>
              ) : null}
              <div className="flex justify-between border-t border-[color:var(--surface-border)] pt-5">
                <Button variant="outline" onClick={() => void toggleStatus(selected)}>
                  {selected.status === 'active' ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {selected.status === 'active' ? t('automations.pause') : t('automations.resume')}
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    void deleteMutation.mutateAsync(selected.id).then(() => setSelectedId(null))
                  }
                >
                  <Trash2 className="size-4" />
                  {t('automations.delete')}
                </Button>
              </div>
            </div>
          ) : automations.length === 0 ? (
            <div className="mx-auto flex h-full w-full max-w-xl items-center px-4 py-10">
              <div className="w-full">
                <div className="mb-6">
                  <Clock3 className="mb-3 size-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">
                    {t('automations.suggestions.title')}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('automations.suggestions.description')}
                  </p>
                </div>
                <div className="divide-y divide-[color:var(--surface-border)] border-y border-[color:var(--surface-border)]">
                  {suggestedSchedules.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="group flex w-full items-center justify-between gap-5 py-4 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      onClick={() =>
                        navigate(`/chat/new?prompt=${encodeURIComponent(suggestion.prompt)}`)
                      }
                    >
                      <span>
                        <span className="block text-sm font-medium text-foreground">
                          {suggestion.title}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {suggestion.description}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              <div>
                <Clock3 className="mx-auto mb-3 size-6" />
                <p>{t('automations.selectPrompt')}</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </section>
  )
}
