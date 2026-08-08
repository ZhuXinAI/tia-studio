import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Square,
  Terminal as TerminalIcon,
  X
} from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TerminalEvent, TerminalRun } from '../../../../../shared/terminal'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { useTranslation } from '../../../i18n/use-app-translation'
import {
  subscribeToTerminal,
  useStartTerminal,
  useStopTerminal,
  useTerminalRuns
} from '../terminal-query'

const XtermOutput = lazy(() =>
  import('./xterm-output').then((module) => ({ default: module.XtermOutput }))
)

function StatusIcon({ status }: { status: TerminalRun['status'] }): React.JSX.Element {
  if (status === 'running') return <LoaderCircle className="size-3.5 animate-spin text-blue-500" />
  if (status === 'exited') return <CheckCircle2 className="size-3.5 text-emerald-500" />
  if (status === 'stopped') return <Square className="size-3.5 text-amber-500" />
  return <CircleAlert className="size-3.5 text-destructive" />
}

export function TerminalRail({
  sessionId,
  slotElement,
  onClose
}: {
  sessionId: string
  slotElement: HTMLDivElement | null
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const { data: runs = [] } = useTerminalRuns(sessionId)
  const startMutation = useStartTerminal(sessionId)
  const stopMutation = useStopTerminal(sessionId)
  const [command, setCommand] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [liveRun, setLiveRun] = useState<TerminalRun | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const selected = useMemo(
    () =>
      runs.find((run) => run.id === selectedId) ??
      runs.find((run) => run.status === 'running') ??
      runs[0],
    [runs, selectedId]
  )

  useEffect(() => {
    if (!selected) {
      setOutput('')
      setLiveRun(null)
      setStreamError(null)
      return
    }
    setSelectedId(selected.id)
    setOutput(selected.output)
    setLiveRun(selected)
    setStreamError(null)
    return subscribeToTerminal(
      sessionId,
      selected.id,
      (event: TerminalEvent) => {
        if (event.type === 'output') setOutput((current) => `${current}${event.text}`)
        else setLiveRun(event.run)
      },
      (error) => setStreamError(error instanceof Error ? error.message : 'Terminal stream ended')
    )
  }, [selected, sessionId])

  if (!slotElement) return null
  return createPortal(
    <div className="flex h-full min-h-0 flex-col bg-background/95">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TerminalIcon className="size-4" /> {t('terminalRail.title')}
          </h2>
          <p className="text-[11px] text-muted-foreground">{t('terminalRail.description')}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
          aria-label={t('terminalRail.close')}
        >
          <X className="size-4" />
        </Button>
      </header>
      <div className="border-b border-border/60 p-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!command.trim() || startMutation.isPending) return
            void startMutation.mutateAsync({ command: command.trim() }).then((run) => {
              setSelectedId(run.id)
              setCommand('')
            })
          }}
        >
          <Input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder={t('terminalRail.commandPlaceholder')}
            aria-label={t('terminalRail.commandLabel')}
            className="h-8 font-mono text-xs"
          />
          <Button
            type="submit"
            size="sm"
            className="h-8"
            disabled={!command.trim() || startMutation.isPending}
          >
            {t('terminalRail.run')}
          </Button>
        </form>
        {startMutation.error ? (
          <p className="mt-2 text-xs text-destructive">
            {startMutation.error instanceof Error
              ? startMutation.error.message
              : t('terminalRail.startFailed')}
          </p>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full flex-col gap-3 p-3">
          {runs.length ? (
            <div className="flex flex-wrap gap-1.5">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedId(run.id)}
                  className={`flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${run.id === selected?.id ? 'border-primary/50 bg-primary/10' : 'border-border/60'}`}
                  title={run.command}
                >
                  <StatusIcon status={run.id === liveRun?.id ? liveRun.status : run.status} />
                  <span className="max-w-32 truncate font-mono">{run.command}</span>
                </button>
              ))}
            </div>
          ) : null}
          {selected ? (
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-black/90">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[10px] text-white/60">
                <span className="truncate font-mono">
                  {selected.cwd} · {liveRun?.status ?? selected.status}
                </span>
                {liveRun?.status === 'running' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-white/70 hover:text-white"
                    onClick={() => void stopMutation.mutateAsync(selected.id)}
                    aria-label={t('terminalRail.stop')}
                  >
                    <Square className="size-3" />
                  </Button>
                ) : null}
              </div>
              {streamError ? (
                <p
                  role="alert"
                  className="border-b border-red-300/20 bg-red-500/10 px-3 py-2 text-[10px] text-red-200"
                >
                  {streamError}
                </p>
              ) : null}
              {output ? (
                <Suspense
                  fallback={
                    <pre
                      aria-live="polite"
                      className="max-h-[28rem] min-h-48 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-white/85"
                    >
                      {output}
                    </pre>
                  }
                >
                  <XtermOutput output={output} ariaLabel={t('terminalRail.outputLabel')} />
                </Suspense>
              ) : (
                <p className="min-h-48 p-3 font-mono text-[11px] leading-relaxed text-white/60">
                  {t('terminalRail.waiting')}
                </p>
              )}
            </div>
          ) : (
            <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
              {t('terminalRail.empty')}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>,
    slotElement
  )
}
