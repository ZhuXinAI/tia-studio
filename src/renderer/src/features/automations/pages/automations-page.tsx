import { Clock3, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'
import { useDesktopAutomations } from '../automations-query'
import { describeAutomationSchedule } from '../../../../../shared/automation-schedule'

type StatusFilter = 'all' | string

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load automations.'
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Unknown'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.valueOf())) {
    return value
  }

  return parsedDate.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function deriveWorkspaceLabel(cwds: string[]): string {
  const primaryPath = cwds[0]?.trim()
  if (!primaryPath) {
    return 'No working directory'
  }

  const segments = primaryPath.split('/').filter((segment) => segment.length > 0)
  return segments.at(-1) ?? primaryPath
}

function formatStatusLabel(value: string | null): string {
  if (!value) {
    return 'Unknown'
  }

  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function AutomationsPage(): React.JSX.Element {
  const { data: automations = [], isLoading, error } = useDesktopAutomations()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('all')
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null)
  const scheduleByAutomationId = useMemo(() => {
    return new Map(
      automations.map((automation) => [automation.id, describeAutomationSchedule(automation.rrule)])
    )
  }, [automations])

  useEffect(() => {
    if (automations.length === 0) {
      setSelectedAutomationId(null)
      return
    }

    if (
      !selectedAutomationId ||
      !automations.some((automation) => automation.id === selectedAutomationId)
    ) {
      setSelectedAutomationId(automations[0]?.id ?? null)
    }
  }, [automations, selectedAutomationId])

  const availableStatuses = useMemo(() => {
    return Array.from(
      new Set(
        automations
          .map((automation) => automation.status)
          .filter((status): status is string => Boolean(status))
      )
    )
  }, [automations])

  const visibleAutomations = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return automations.filter((automation) => {
      const matchesStatus = activeStatus === 'all' || automation.status === activeStatus
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [
          automation.name,
          automation.prompt ?? '',
          automation.id,
          automation.executionEnvironment ?? '',
          ...automation.cwds
        ].some((value) => value.toLowerCase().includes(normalizedQuery))

      return matchesStatus && matchesQuery
    })
  }, [activeStatus, automations, searchQuery])

  const selectedAutomation =
    visibleAutomations.find((automation) => automation.id === selectedAutomationId) ??
    automations.find((automation) => automation.id === selectedAutomationId) ??
    null
  const selectedSchedule = selectedAutomation
    ? (scheduleByAutomationId.get(selectedAutomation.id) ?? null)
    : null

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-[color:var(--surface-border)] px-8 py-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-editorial text-[2.6rem] leading-none tracking-[-0.04em]">
                Automations
              </h1>
              <span className="rounded-full bg-[color:var(--surface-muted)] px-3 py-1 text-[11px] text-muted-foreground">
                {automations.length} detected
              </span>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Imported Codex automation definitions loaded from `~/.codex/automations`. TIA Studio
              reads them without editing the files, changing their scheduler, or mixing them with
              app-owned automation state.
            </p>
          </div>

          <div className="relative w-full xl:w-[24rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search automations"
              className="h-11 rounded-xl pl-9"
            />
          </div>
        </div>
      </div>

      <div className="border-b border-[color:var(--surface-border)] px-8 py-4">
        <div className="flex flex-wrap gap-2">
          {(['all', ...availableStatuses] as StatusFilter[]).map((status) => {
            const count =
              status === 'all'
                ? automations.length
                : automations.filter((automation) => automation.status === status).length

            return (
              <button
                key={status}
                type="button"
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors',
                  activeStatus === status
                    ? 'bg-[color:var(--surface-active)] text-foreground'
                    : 'text-muted-foreground hover:bg-[color:var(--surface-muted)] hover:text-foreground'
                )}
                onClick={() => setActiveStatus(status)}
              >
                <span>{status === 'all' ? 'All statuses' : formatStatusLabel(status)}</span>
                <span className="rounded-full bg-[color:var(--surface-paper)] px-2 py-0.5 text-[11px] text-muted-foreground">
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-8 py-6">
        {isLoading ? (
          <div className="rounded-[1.4rem] border border-dashed border-[color:var(--surface-border)] px-6 py-10 text-center text-sm text-muted-foreground">
            Loading detected automations...
          </div>
        ) : error ? (
          <div className="rounded-[1.4rem] border border-dashed border-[color:var(--surface-border)] px-6 py-10 text-center text-sm text-muted-foreground">
            {formatErrorMessage(error)}
          </div>
        ) : visibleAutomations.length === 0 ? (
          <div className="rounded-[1.4rem] border border-dashed border-[color:var(--surface-border)] px-6 py-10 text-center text-sm text-muted-foreground">
            No automation definitions match this filter.
          </div>
        ) : (
          <div className="grid h-full min-h-0 gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto">
              <div className="space-y-3">
                {visibleAutomations.map((automation) => {
                  const isActive = automation.id === selectedAutomationId
                  const schedule = scheduleByAutomationId.get(automation.id)

                  return (
                    <button
                      key={automation.id}
                      type="button"
                      className={cn(
                        'flex w-full flex-col gap-4 rounded-[1.4rem] border px-5 py-4 text-left transition-colors',
                        isActive
                          ? 'border-[color:var(--surface-border-strong)] bg-[color:var(--surface-active)] shadow-[inset_0_0_0_1px_var(--surface-active-strong)]'
                          : 'border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_70%,transparent))] hover:bg-[color:var(--surface-muted)]'
                      )}
                      onClick={() => setSelectedAutomationId(automation.id)}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <span
                          className={cn(
                            'inline-flex size-3 shrink-0 rounded-full',
                            automation.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-400'
                          )}
                        />
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-editorial text-[1.3rem] leading-none tracking-[-0.02em]">
                              {automation.name}
                            </p>
                            <span className="rounded-full bg-[color:var(--surface-panel-soft)] px-3 py-1 text-[11px] text-muted-foreground">
                              Codex import
                            </span>
                            <span className="rounded-full bg-[color:var(--surface-paper)] px-3 py-1 text-[11px] text-muted-foreground">
                              {deriveWorkspaceLabel(automation.cwds)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{schedule?.summary ?? 'No saved schedule'}</span>
                            <span>{automation.executionEnvironment ?? 'Execution pending'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Updated {formatTimestamp(automation.updatedAt)}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedAutomation ? (
              <div className="min-h-0 overflow-y-auto">
                <div className="rounded-[1.4rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_68%,transparent))] px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-editorial text-[1.6rem] leading-none tracking-[-0.03em]">
                          {selectedAutomation.name}
                        </p>
                        <span className="rounded-full bg-[color:var(--surface-panel-soft)] px-3 py-1 text-[11px] text-muted-foreground">
                          Codex import
                        </span>
                        <span className="rounded-full bg-[color:var(--surface-paper)] px-3 py-1 text-[11px] text-muted-foreground">
                          {formatStatusLabel(selectedAutomation.status)}
                        </span>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {selectedAutomation.prompt ?? 'No prompt stored in automation.toml.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-[color:var(--surface-paper)] px-3 py-1 text-[11px] text-muted-foreground">
                        {selectedAutomation.model ?? 'Model pending'}
                      </span>
                      <span className="rounded-full bg-[color:var(--surface-paper)] px-3 py-1 text-[11px] text-muted-foreground">
                        {selectedAutomation.executionEnvironment ?? 'Execution pending'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[1.1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4">
                      <p className="section-kicker text-[0.62rem]">Schedule</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {selectedSchedule?.summary ?? 'No saved schedule'}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {selectedSchedule?.nextRunAt
                          ? `Next run ${formatTimestamp(selectedSchedule.nextRunAt)}`
                          : selectedAutomation.rrule
                            ? 'Next run is not available for this RRULE yet.'
                            : 'No RRULE found in automation.toml.'}
                      </p>
                      <p className="mt-1 break-all text-[11px] leading-5 text-muted-foreground">
                        {selectedAutomation.rrule ?? 'No RRULE found in automation.toml.'}
                      </p>
                    </div>

                    <div className="rounded-[1.1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4">
                      <p className="section-kicker text-[0.62rem]">Updated</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {formatTimestamp(selectedAutomation.updatedAt)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Created {formatTimestamp(selectedAutomation.createdAt)}
                      </p>
                    </div>

                    <div className="rounded-[1.1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4 lg:col-span-2">
                      <p className="section-kicker text-[0.62rem]">Working directories</p>
                      <div className="mt-2 space-y-2">
                        {selectedAutomation.cwds.length > 0 ? (
                          selectedAutomation.cwds.map((cwd) => (
                            <p key={cwd} className="break-all text-sm text-foreground">
                              {cwd}
                            </p>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No working directories were declared.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[1.1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4 lg:col-span-2">
                      <p className="section-kicker text-[0.62rem]">Definition file</p>
                      <p className="mt-2 break-all text-sm text-foreground">
                        {selectedAutomation.filePath}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Execution is managed by Codex using this on-disk definition.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <div className="flex flex-wrap items-center gap-2 rounded-[1.2rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-4 py-3 text-sm text-muted-foreground">
                    <Sparkles className="size-4 text-primary" />
                    <span>
                      Imported automations stay read-only here, so future TIA Studio automations can
                      use a separate store and execution path without interfering with Codex.
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {!isLoading && !error && automations.length > 0 ? (
          <div className="pt-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Clock3 className="size-3.5" />
              Scheduling and execution are owned by the Codex automation engine, not a renderer-only
              mock.
            </span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
