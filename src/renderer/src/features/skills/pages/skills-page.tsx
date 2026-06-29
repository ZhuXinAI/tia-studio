import { Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'
import { useDesktopSkills } from '../skills-query'
import type { DesktopSkillSource } from '../../../../../shared/desktop-discovery'

type SourceFilter = 'all' | DesktopSkillSource

const sourceLabels: Record<DesktopSkillSource, string> = {
  'global-codex': 'Codex',
  'global-claude': 'Claude',
  'global-agent': 'Agents',
  'global-agent-legacy': 'Agent legacy',
  workspace: 'Workspace'
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load skills.'
}

function describeSkillScope(canDelete: boolean): string {
  return canDelete ? 'Repo-local skill folder' : 'Global skill folder'
}

export function SkillsPage(): React.JSX.Element {
  const { data: skills = [], isLoading, error } = useDesktopSkills()
  const [activeSource, setActiveSource] = useState<SourceFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const availableSources = useMemo(() => {
    return Array.from(new Set(skills.map((skill) => skill.source)))
  }, [skills])

  const filters = useMemo<SourceFilter[]>(() => {
    return ['all', ...availableSources]
  }, [availableSources])

  const visibleSkills = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return skills.filter((skill) => {
      const matchesSource = activeSource === 'all' || skill.source === activeSource
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [skill.name, skill.description ?? '', skill.relativePath, skill.sourceRootPath].some(
          (value) => value.toLowerCase().includes(normalizedQuery)
        )

      return matchesSource && matchesQuery
    })
  }, [activeSource, searchQuery, skills])

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-[color:var(--surface-border)] px-8 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-editorial text-[2.6rem] leading-none tracking-[-0.04em]">
                Skills
              </h1>
              <span className="rounded-full bg-[color:var(--surface-muted)] px-3 py-1 text-[11px] text-muted-foreground">
                {skills.length} detected
              </span>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Local skill directories discovered from the real machine sources TIA Studio can see.
              The list is read-only for now so we do not pretend installs succeeded when nothing was
              actually written.
            </p>
          </div>

          <div className="relative w-full xl:w-[24rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search detected skills"
              className="h-11 rounded-xl pl-9"
            />
          </div>
        </div>
      </div>

      <div className="border-b border-[color:var(--surface-border)] px-8 py-4">
        <div className="flex flex-wrap gap-2">
          {filters.map((source) => {
            const label = source === 'all' ? 'All sources' : sourceLabels[source]
            const count =
              source === 'all'
                ? skills.length
                : skills.filter((skill) => skill.source === source).length

            return (
              <button
                key={source}
                type="button"
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors',
                  activeSource === source
                    ? 'bg-[color:var(--surface-active)] text-foreground'
                    : 'text-muted-foreground hover:bg-[color:var(--surface-muted)] hover:text-foreground'
                )}
                onClick={() => setActiveSource(source)}
              >
                <span>{label}</span>
                <span className="rounded-full bg-[color:var(--surface-paper)] px-2 py-0.5 text-[11px] text-muted-foreground">
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="rounded-[1.4rem] border border-dashed border-[color:var(--surface-border)] px-6 py-10 text-center text-sm text-muted-foreground">
            Loading detected skills...
          </div>
        ) : error ? (
          <div className="rounded-[1.4rem] border border-dashed border-[color:var(--surface-border)] px-6 py-10 text-center text-sm text-muted-foreground">
            {formatErrorMessage(error)}
          </div>
        ) : visibleSkills.length === 0 ? (
          <div className="rounded-[1.4rem] border border-dashed border-[color:var(--surface-border)] px-6 py-10 text-center text-sm text-muted-foreground">
            No detected skills match this filter.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {visibleSkills.map((skill) => (
              <article
                key={skill.id}
                className="rounded-[1.4rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_70%,transparent))] p-5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_40%,transparent)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-editorial text-[1.225rem] leading-none tracking-[-0.025em]">
                      {skill.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-[color:var(--surface-muted)] px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]">
                        {sourceLabels[skill.source]}
                      </span>
                      <span>{describeSkillScope(skill.canDelete)}</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-[color:var(--surface-panel-soft)] px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    SKILL.md
                  </span>
                </div>

                <p className="pt-4 text-sm leading-6 text-muted-foreground">
                  {skill.description ?? 'No description found in SKILL.md yet.'}
                </p>

                <div className="mt-5 space-y-3 rounded-[1.1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4">
                  <div className="space-y-1">
                    <p className="section-kicker text-[0.62rem]">Relative path</p>
                    <p className="break-words text-sm font-medium text-foreground">
                      {skill.relativePath}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="section-kicker text-[0.62rem]">Source root</p>
                    <p className="break-all text-xs leading-5 text-muted-foreground">
                      {skill.sourceRootPath}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {!isLoading && !error && skills.length > 0 ? (
          <div className="pt-6">
            <div className="flex flex-wrap items-center gap-2 rounded-[1.2rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-4 py-3 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-primary" />
              <span>
                This view now reads actual local skill folders instead of placeholder marketplace
                cards.
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
