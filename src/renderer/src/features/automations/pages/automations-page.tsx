import { useEffect, useMemo, useState } from 'react'
import { Clock3, Pause, Play, Plus, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { SaveTiaAutomationInput, TiaAutomationRecord } from '../../../../../shared/automations'
import { describeAutomationSchedule } from '../../../../../shared/automation-schedule'
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

type Draft = SaveTiaAutomationInput & {
  frequency: 'HOURLY' | 'DAILY' | 'WEEKLY'
  time: string
  weekday: string
}

const weekdays = [
  ['MO', 'Monday'],
  ['TU', 'Tuesday'],
  ['WE', 'Wednesday'],
  ['TH', 'Thursday'],
  ['FR', 'Friday'],
  ['SA', 'Saturday'],
  ['SU', 'Sunday']
] as const

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

function formatTimestamp(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value)
      )
    : 'Never'
}

export function AutomationsPage(): React.JSX.Element {
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
      toast.success('Automation saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save schedule')
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

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--surface-paper)]">
      <header className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Schedules</h1>
          <p className="text-sm text-muted-foreground">
            Scheduled Pi work owned and executed by TIA Studio.
          </p>
        </div>
        <Button onClick={() => beginEdit()} disabled={!workspaces.length || !providers.length}>
          <Plus className="size-4" /> New schedule
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="chat-scrollbar overflow-y-auto border-r border-[color:var(--surface-border)] p-3">
          {isLoading ? <p className="p-3 text-sm text-muted-foreground">Loading…</p> : null}
          {!isLoading && automations.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              Create a schedule for repeatable Pi work.
            </div>
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
                  {describeAutomationSchedule(automation.rrule).summary}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <main className="chat-scrollbar min-h-0 overflow-y-auto p-6">
          {editingId ? (
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {editingId === 'new' ? 'New schedule' : 'Edit schedule'}
                </h2>
                <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}>
                  <X className="size-4" />
                </Button>
              </div>
              <div className="grid gap-4 rounded-xl border border-[color:var(--surface-border)] p-5">
                <label className="grid gap-1.5 text-sm">
                  <span>Name</span>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>Instructions</span>
                  <Textarea
                    rows={8}
                    value={draft.prompt}
                    onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span>Workspace</span>
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
                    <span>Provider</span>
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
                  <span>Model</span>
                  <Input
                    value={draft.modelId}
                    onChange={(e) => setDraft({ ...draft, modelId: e.target.value })}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="grid gap-1.5 text-sm">
                    <span>Repeat</span>
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={draft.frequency}
                      onChange={(e) =>
                        setDraft({ ...draft, frequency: e.target.value as Draft['frequency'] })
                      }
                    >
                      <option value="HOURLY">Hourly</option>
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                    </select>
                  </label>
                  {draft.frequency === 'WEEKLY' ? (
                    <label className="grid gap-1.5 text-sm">
                      <span>Day</span>
                      <select
                        className="h-10 rounded-md border bg-background px-3"
                        value={draft.weekday}
                        onChange={(e) => setDraft({ ...draft, weekday: e.target.value })}
                      >
                        {weekdays.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="grid gap-1.5 text-sm">
                    <span>{draft.frequency === 'HOURLY' ? 'Minute' : 'Time'}</span>
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
                  {mutationPending ? 'Saving…' : 'Save schedule'}
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
                    {selected.status}
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold">{selected.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {describeAutomationSchedule(selected.rrule).summary}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => beginEdit(selected)}>
                    Edit
                  </Button>
                  <Button
                    onClick={() => void runMutation.mutateAsync(selected.id)}
                    disabled={runMutation.isPending}
                  >
                    <Play className="size-4" />
                    Run now
                  </Button>
                </div>
              </div>
              <div className="whitespace-pre-wrap rounded-xl border border-[color:var(--surface-border)] p-5 text-sm leading-6">
                {selected.prompt}
              </div>
              <dl className="grid gap-px overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-border)] sm:grid-cols-2">
                {[
                  ['Workspace', workspaceNames.get(selected.workspaceId) ?? selected.workspaceId],
                  ['Model', selected.modelId],
                  ['Next run', formatTimestamp(selected.nextRunAt)],
                  ['Last run', formatTimestamp(selected.lastRunAt)]
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
                  {selected.status === 'active' ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    void deleteMutation.mutateAsync(selected.id).then(() => setSelectedId(null))
                  }
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              <div>
                <Clock3 className="mx-auto mb-3 size-6" />
                <p>Select a schedule or create one.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </section>
  )
}
