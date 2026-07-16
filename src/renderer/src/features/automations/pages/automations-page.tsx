import { Bot, Clock3, Folder, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'
import { useDesktopAutomations } from '../automations-query'
import { describeAutomationSchedule } from '../../../../../shared/automation-schedule'

type StatusFilter = 'all' | 'active' | 'paused'

function isActive(status: string | null): boolean {
  return status?.toUpperCase() === 'ACTIVE'
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load automations.'
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function workspaceName(paths: string[]): string {
  const path = paths[0]?.trim()
  if (!path) return 'No project'
  return path.split('/').filter(Boolean).at(-1) ?? path
}

export function AutomationsPage(): React.JSX.Element {
  const { data: automations = [], isLoading, error } = useDesktopAutomations()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase()
    return automations.filter((automation) => {
      const active = isActive(automation.status)
      const matchesStatus = filter === 'all' || (filter === 'active' ? active : !active)
      const matchesSearch =
        !search ||
        [automation.name, automation.prompt ?? '', automation.model ?? '', ...automation.cwds].some(
          (value) => value.toLowerCase().includes(search)
        )
      return matchesStatus && matchesSearch
    })
  }, [automations, filter, query])

  useEffect(() => {
    if (!visible.some((automation) => automation.id === selectedId)) {
      setSelectedId(visible[0]?.id ?? null)
    }
  }, [selectedId, visible])

  const selected = visible.find((automation) => automation.id === selectedId) ?? null
  const selectedSchedule = selected ? describeAutomationSchedule(selected.rrule) : null
  const activeCount = automations.filter((automation) => isActive(automation.status)).length

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--shell-canvas)]">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-[color:var(--surface-border)] px-5">
        <h1 className="text-sm font-semibold">Automations</h1>
        <nav className="flex h-full items-center gap-5" aria-label="Automation filters">
          {(
            [
              ['all', 'All', automations.length],
              ['active', 'Active', activeCount],
              ['paused', 'Paused', automations.length - activeCount]
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              className={cn(
                'relative h-full text-sm text-muted-foreground transition-colors hover:text-foreground',
                filter === value &&
                  'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-foreground'
              )}
              onClick={() => setFilter(value)}
            >
              {label}
              <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
            </button>
          ))}
        </nav>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(18rem,42%)_minmax(24rem,1fr)]">
        <div className="flex min-h-0 flex-col border-r border-[color:var(--surface-border)]">
          <div className="border-b border-[color:var(--surface-border)] p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search scheduled tasks"
                aria-label="Search automations"
                className="h-9 rounded-lg border-[color:var(--surface-border-strong)] bg-[color:var(--surface-panel-soft)] pl-9 shadow-none"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading automations…</p>
            ) : error ? (
              <p className="p-4 text-sm text-destructive">{formatErrorMessage(error)}</p>
            ) : visible.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No automations match this view.</p>
            ) : (
              <div className="space-y-1">
                {visible.map((automation) => {
                  const schedule = describeAutomationSchedule(automation.rrule)
                  return (
                    <button
                      key={automation.id}
                      type="button"
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-[color:var(--surface-muted)]',
                        automation.id === selectedId && 'bg-[color:var(--surface-active)]'
                      )}
                      onClick={() => setSelectedId(automation.id)}
                    >
                      <span
                        className={cn(
                          'mt-1.5 size-3 shrink-0 rounded-full border',
                          isActive(automation.status)
                            ? 'border-emerald-500 bg-emerald-500'
                            : 'border-muted-foreground/50'
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {automation.name}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {schedule.summary}
                          <span className="px-1.5">·</span>
                          {workspaceName(automation.cwds)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {selected ? (
            <div className="mx-auto max-w-3xl px-7 py-6">
              <div className="mb-7 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        isActive(selected.status) ? 'bg-emerald-500' : 'bg-muted-foreground'
                      )}
                    />
                    {isActive(selected.status) ? 'Active' : 'Paused'}
                    <span>·</span>
                    Codex import
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight">{selected.name}</h2>
                </div>
                <span className="rounded-md bg-[color:var(--surface-panel-soft)] px-2 py-1 text-xs text-muted-foreground">
                  Read only
                </span>
              </div>

              <div className="mb-8 whitespace-pre-wrap rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4 text-sm leading-6">
                {selected.prompt ?? 'No prompt stored in this automation definition.'}
              </div>

              <div className="space-y-7">
                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Details
                  </h3>
                  <dl className="divide-y divide-[color:var(--surface-border)] rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-4">
                    <DetailRow icon={Folder} label="Project" value={workspaceName(selected.cwds)} />
                    <DetailRow icon={Bot} label="Model" value={selected.model ?? 'Default model'} />
                    <DetailRow
                      icon={Clock3}
                      label="Schedule"
                      value={selectedSchedule?.summary ?? 'No schedule'}
                    />
                  </dl>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Source
                  </h3>
                  <div className="space-y-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4 text-xs">
                    <p className="break-all text-foreground">{selected.filePath}</p>
                    <p className="text-muted-foreground">
                      Updated {formatTimestamp(selected.updatedAt)}
                    </p>
                    {selectedSchedule?.nextRunAt ? (
                      <p className="text-muted-foreground">
                        Next run {formatTimestamp(selectedSchedule.nextRunAt)}
                      </p>
                    ) : null}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center p-8 text-sm text-muted-foreground">
              Select an automation to view its definition.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-4 py-3 text-sm">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  )
}
