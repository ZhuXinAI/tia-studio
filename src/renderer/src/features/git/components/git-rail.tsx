import {
  ArrowDownToLine,
  ArrowUpFromLine,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
  X
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  useGitReview,
  useStageGitPaths,
  useUnstageGitPaths
} from '../git-query'

export function GitRail({
  sessionId,
  slotElement,
  onClose
}: {
  sessionId: string
  slotElement: HTMLDivElement | null
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const { data: review, isLoading, isError, refetch, isFetching } = useGitReview(sessionId)
  const stageMutation = useStageGitPaths(sessionId)
  const unstageMutation = useUnstageGitPaths(sessionId)
  const mutationPending = stageMutation.isPending || unstageMutation.isPending
  const worktreePaths = useMemo(
    () => review?.changes.filter((change) => change.worktree).map((change) => change.path) ?? [],
    [review?.changes]
  )
  const stagedPaths = useMemo(
    () => review?.changes.filter((change) => change.staged).map((change) => change.path) ?? [],
    [review?.changes]
  )

  async function stage(paths: string[]): Promise<void> {
    try {
      await stageMutation.mutateAsync(paths)
      toast.success(t(paths.length === 1 ? 'gitRail.changeStaged' : 'gitRail.changesStaged', { count: paths.length }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gitRail.stageFailed'))
    }
  }

  async function unstage(paths: string[]): Promise<void> {
    try {
      await unstageMutation.mutateAsync(paths)
      toast.success(t(paths.length === 1 ? 'gitRail.changeUnstaged' : 'gitRail.changesUnstaged', { count: paths.length }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gitRail.unstageFailed'))
    }
  }

  if (!slotElement) return null
  return createPortal(
    <div className="flex h-full min-h-0 flex-col bg-background/95">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="size-4" /> {t('gitRail.title')}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {review?.isRepository ? review.branch ?? t('gitRail.detachedHead') : t('gitRail.notRepository')}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => void refetch()} aria-label={t('gitRail.refresh')}>
            <RefreshCw className={isFetching ? 'size-3.5 animate-spin' : 'size-3.5'} />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label={t('gitRail.close')}>
            <X className="size-4" />
          </Button>
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {isLoading ? <p className="text-xs text-muted-foreground">{t('gitRail.loading')}</p> : null}
          {isError ? <p className="text-xs text-destructive">{t('gitRail.loadFailed')}</p> : null}
          {review?.isRepository ? (
            <>
              <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <div className="rounded-lg bg-muted/50 p-2"><strong className="block text-sm">{review.changes.length}</strong>{t('gitRail.changes')}</div>
                <div className="rounded-lg bg-muted/50 p-2"><strong className="block text-sm">{review.ahead}</strong>{t('gitRail.ahead')}</div>
                <div className="rounded-lg bg-muted/50 p-2"><strong className="block text-sm">{review.behind}</strong>{t('gitRail.behind')}</div>
              </div>
              <div className="rounded-xl border border-border/60">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <GitCommitHorizontal className="size-3.5" /> {t('gitRail.changedFiles')}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      disabled={!worktreePaths.length || mutationPending}
                      onClick={() => void stage(worktreePaths)}
                    >
                      <ArrowDownToLine className="size-3" /> {t('gitRail.stageWorktree')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      disabled={!stagedPaths.length || mutationPending}
                      onClick={() => void unstage(stagedPaths)}
                    >
                      <ArrowUpFromLine className="size-3" /> {t('gitRail.unstage')}
                    </Button>
                  </div>
                </div>
                {review.changes.length ? (
                  <ul className="divide-y divide-border/50">
                    {review.changes.map((change) => (
                      <li key={`${change.status}-${change.path}`} className="flex items-center gap-2 px-3 py-2 text-xs">
                        <span className="w-5 font-mono font-semibold text-muted-foreground">{change.status}</span>
                        <span className="min-w-0 flex-1 truncate font-mono" title={change.path}>{change.path}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          {change.staged ? <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-700">staged</span> : null}
                          {change.worktree ? <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-700">worktree</span> : null}
                          {change.worktree ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px]"
                              disabled={mutationPending}
                              onClick={() => void stage([change.path])}
                            >
                              {t('gitRail.stage')}
                            </Button>
                          ) : change.staged ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px]"
                              disabled={mutationPending}
                              onClick={() => void unstage([change.path])}
                            >
                              {t('gitRail.unstage')}
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="p-3 text-xs text-muted-foreground">{t('gitRail.clean')}</p>}
              </div>
              <div className="rounded-xl border border-border/60">
                <div className="border-b border-border/60 px-3 py-2 text-xs font-medium">{t('gitRail.diff')}</div>
                <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">{review.diff || t('gitRail.noDiff')}</pre>
              </div>
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>,
    slotElement
  )
}
