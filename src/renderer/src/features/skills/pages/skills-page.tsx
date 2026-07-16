import { Search, Sparkles } from 'lucide-react'
import { forwardRef, useDeferredValue, useMemo, useState } from 'react'
import { VirtuosoGrid, type VirtuosoGridProps } from 'react-virtuoso'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'
import { useDesktopSkillsCatalog } from '../skills-query'
import type { DesktopSkillSource } from '../../../../../shared/desktop-discovery'
import type {
  DesktopSkillRecord,
  DesktopSkillSourceCounts
} from '../../../../../shared/desktop-discovery'

type SourceFilter = 'all' | DesktopSkillSource

const sourceLabels: Record<DesktopSkillSource, string> = {
  'global-codex': 'Codex',
  'global-claude': 'Claude',
  'global-agent': 'Agents',
  'global-agent-legacy': 'Agent legacy',
  workspace: 'Workspace'
}

const emptySourceCounts: DesktopSkillSourceCounts = {
  'global-codex': 0,
  'global-claude': 0,
  'global-agent': 0,
  'global-agent-legacy': 0,
  workspace: 0
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load skills.'
}

function describeSkillScope(canDelete: boolean): string {
  return canDelete ? 'Repo-local skill folder' : 'Global skill folder'
}

const SkillsGridList = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, style, children, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className={cn('flex flex-wrap content-start gap-4', className)}
      style={{ ...style }}
    >
      {children}
    </div>
  )
)

SkillsGridList.displayName = 'SkillsGridList'

const skillsGridComponents: VirtuosoGridProps<DesktopSkillRecord>['components'] = {
  List: SkillsGridList,
  Item: ({ className, children, ...props }) => (
    <div
      {...props}
      className={cn(
        'flex w-full flex-none sm:w-[calc(50%_-_0.5rem)] 2xl:w-[calc(33.333%_-_0.75rem)]',
        className
      )}
    >
      {children}
    </div>
  )
}

function countDetectedSkills(sourceCounts: DesktopSkillSourceCounts): number {
  return Object.values(sourceCounts).reduce((total, count) => total + count, 0)
}

function SkillCard({ skill }: { skill: DesktopSkillRecord }): React.JSX.Element {
  return (
    <article className="flex h-full w-full flex-col rounded-[1.4rem] border border-[color:var(--surface-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-paper)_98%,transparent),color-mix(in_srgb,var(--surface-panel)_70%,transparent))] p-5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-paper)_40%,transparent)]">
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

      <p className="min-h-[6rem] pt-4 text-sm leading-6 text-muted-foreground overflow-hidden">
        {skill.description ?? 'No description found in SKILL.md yet.'}
      </p>

      <div className="mt-auto pt-5">
        <div className="space-y-3 rounded-[1.1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] p-4">
          <div className="space-y-1">
            <p className="section-kicker text-[0.62rem]">Relative path</p>
            <p className="break-words text-sm font-medium text-foreground">{skill.relativePath}</p>
          </div>
          <div className="space-y-1">
            <p className="section-kicker text-[0.62rem]">Source root</p>
            <p className="break-all text-xs leading-5 text-muted-foreground">
              {skill.sourceRootPath}
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}

export function SkillsPage(): React.JSX.Element {
  const [activeSource, setActiveSource] = useState<SourceFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error
  } = useDesktopSkillsCatalog({
    search: deferredSearchQuery,
    source: activeSource === 'all' ? null : activeSource
  })
  const loadedPages = data?.pages ?? []
  const loadedSkills = useMemo(
    () => loadedPages.flatMap((page) => page.skills),
    [loadedPages]
  )
  const firstPage = loadedPages[0]
  const sourceCounts = firstPage?.sourceCounts ?? emptySourceCounts
  const totalDetectedSkills = countDetectedSkills(sourceCounts)
  const activeSourceCount =
    activeSource === 'all' ? totalDetectedSkills : sourceCounts[activeSource] ?? 0

  const availableSources = useMemo(() => {
    return (Object.entries(sourceCounts) as Array<[DesktopSkillSource, number]>)
      .filter(([source, count]) => count > 0 || source === activeSource)
      .map(([source]) => source)
  }, [activeSource, sourceCounts])

  const filters = useMemo<SourceFilter[]>(() => {
    return ['all', ...availableSources]
  }, [availableSources])

  const gridComponents = useMemo<VirtuosoGridProps<DesktopSkillRecord>['components']>(() => {
    return {
      ...skillsGridComponents,
      Footer: () => (
        <div className="flex justify-center px-3 py-5 text-xs text-muted-foreground">
          {isFetchingNextPage
            ? 'Loading more skills...'
            : hasNextPage
              ? 'Scroll to load more skills.'
              : 'All matching skills loaded.'}
        </div>
      )
    }
  }, [hasNextPage, isFetchingNextPage])

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
                {activeSourceCount} detected
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
            const count = source === 'all' ? totalDetectedSkills : sourceCounts[source] ?? 0

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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 py-6">
        {isLoading ? (
          <div className="rounded-[1.4rem] border border-dashed border-[color:var(--surface-border)] px-6 py-10 text-center text-sm text-muted-foreground">
            Loading detected skills...
          </div>
        ) : error ? (
          <div className="rounded-[1.4rem] border border-dashed border-[color:var(--surface-border)] px-6 py-10 text-center text-sm text-muted-foreground">
            {formatErrorMessage(error)}
          </div>
        ) : loadedSkills.length === 0 ? (
          <div className="rounded-[1.4rem] border border-dashed border-[color:var(--surface-border)] px-6 py-10 text-center text-sm text-muted-foreground">
            No detected skills match this filter.
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <VirtuosoGrid
              style={{ height: '100%' }}
              data={loadedSkills}
              components={gridComponents}
              overscan={480}
              increaseViewportBy={{ top: 320, bottom: 640 }}
              initialItemCount={Math.min(loadedSkills.length, 12)}
              computeItemKey={(_index, skill) => skill.id}
              endReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  void fetchNextPage()
                }
              }}
              itemContent={(_index, skill) => <SkillCard skill={skill} />}
            />
          </div>
        )}

        {!isLoading && !error && totalDetectedSkills > 0 ? (
          <div className="pt-6">
            <div className="flex flex-wrap items-center gap-2 rounded-[1.2rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-panel-soft)] px-4 py-3 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-primary" />
              <span>
                This view now reads actual local skill folders and incrementally loads matching
                catalog pages so larger skill collections stay responsive.
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
