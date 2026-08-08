import { CheckCircle2, CircleAlert, Code2, LoaderCircle, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useState } from 'react'
import { Button } from '../../../components/ui/button'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { useTranslation } from '../../../i18n/use-app-translation'
import { usePythonCheck, usePythonProject } from '../python-query'

export function PythonRail({
  sessionId,
  slotElement,
  onClose
}: {
  sessionId: string
  slotElement: HTMLDivElement | null
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const { data: project, isLoading, isError } = usePythonProject(sessionId)
  const checkMutation = usePythonCheck(sessionId)
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof checkMutation.mutateAsync>> | null>(null)
  if (!slotElement) return null
  return createPortal(
    <div className="flex h-full min-h-0 flex-col bg-background/95">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Code2 className="size-4" /> {t('pythonRail.title')}
          </h2>
          <p className="text-[11px] text-muted-foreground">{t('pythonRail.description')}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label={t('pythonRail.close')}>
          <X className="size-4" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {isLoading ? <p className="text-xs text-muted-foreground">{t('pythonRail.loading')}</p> : null}
          {isError ? <p className="text-xs text-destructive">{t('pythonRail.loadFailed')}</p> : null}
          {project ? (
            <>
              <div className="rounded-xl border border-border/60 p-3 text-xs">
                <p className="font-medium">{project.interpreter?.version ?? t('pythonRail.noInterpreter')}</p>
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  {project.interpreter?.executable ?? t('pythonRail.installHint')}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {project.hasVirtualEnvironment ? t('pythonRail.virtualEnvironment') : t('pythonRail.pathDiscovery')}
                </p>
              </div>
              {project.projectFiles.length ? (
                <div className="rounded-xl border border-border/60 p-3">
                  <p className="text-xs font-medium">{t('pythonRail.projectSignals')}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {project.projectFiles.map((file) => <span key={file} className="rounded-md bg-muted px-2 py-1 font-mono text-[10px]">{file}</span>)}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2">
                {(['compile', 'pytest'] as const).map((kind) => (
                  <Button
                    key={kind}
                    type="button"
                    variant="outline"
                    className="justify-start"
                    disabled={!project.interpreter || checkMutation.isPending}
                    onClick={() => void checkMutation.mutateAsync(kind).then(setLastResult)}
                  >
                    {checkMutation.isPending && checkMutation.variables === kind ? <LoaderCircle className="size-4 animate-spin" /> : kind === 'compile' ? <Code2 className="size-4" /> : <CheckCircle2 className="size-4" />}
                    {kind === 'compile' ? t('pythonRail.compile') : t('pythonRail.pytest')}
                  </Button>
                ))}
              </div>
              {lastResult ? (
                <div className="rounded-xl border border-border/60">
                  <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs font-medium">
                    {lastResult.passed ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <CircleAlert className="size-3.5 text-destructive" />}
                    {lastResult.kind} · {lastResult.durationMs} ms
                  </div>
                  <ScrollArea className="max-h-64">
                    <pre className="whitespace-pre-wrap p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                      {lastResult.output || t('pythonRail.noOutput')}
                    </pre>
                  </ScrollArea>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>,
    slotElement
  )
}
